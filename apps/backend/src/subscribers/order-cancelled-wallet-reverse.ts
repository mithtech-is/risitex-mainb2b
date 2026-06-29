import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../modules/cashfree_wallet"

/**
 * Reverses the wallet portion of a split-payment order when the
 * order is canceled or fully refunded.
 *
 * `cashfree_wallet.reverseOrderDebits({reference_id, reason})`:
 *
 *   - Finds every `wallet_transaction` with
 *       direction:"debit", kind:"order_debit",
 *       reference_id:<order_id>.
 *   - For each, writes a matching credit row keyed by
 *       `reverse_<original_transaction_id>`.
 *   - Idempotent on the original transaction id — duplicate
 *     `order.canceled` events (or our own retry) are no-ops.
 *
 * Promo and main debits both reverse — promo back to promo, main
 * back to main — so the customer ends up exactly where they were
 * before the order.
 *
 * Pure-Razorpay / pure-COD orders pass through untouched (the
 * lookup finds zero debits).
 */
export default async function reverseWalletForOrder({
  event: { name, data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  type OrderLike = {
    id: string
    customer_id: string | null
    metadata: Record<string, unknown> | null
  }

  let order: OrderLike
  try {
    const { data: rows } = await query.graph({
      entity: "order",
      fields: ["id", "customer_id", "metadata"],
      filters: { id: data.id },
    })
    if (!rows?.length) {
      logger.warn(`[wallet:refund] order ${data.id} not found via query`)
      return
    }
    order = rows[0] as unknown as OrderLike
  } catch (err) {
    logger.warn(
      `[wallet:refund] order ${data.id} not retrievable: ${err instanceof Error ? err.message : err}`,
    )
    return
  }

  // Fast-path: wallet_apply metadata absent ⇒ this order never
  // touched the wallet. Skip the reversal query entirely.
  const walletApply = (order.metadata?.wallet_apply ?? null) as {
    amount_paise?: number
  } | null
  const amountPaise = Number(walletApply?.amount_paise)
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    return
  }
  if (!order.customer_id) return

  const wallets =
    container.resolve<CashfreeWalletService>(CASHFREE_WALLET_MODULE)

  try {
    // Plugin enum: "order_cancelled" | "refund" | "admin_reversal".
    // Pick by event name.
    const reason: "order_cancelled" | "refund" =
      name === "order.refund_created" ? "refund" : "order_cancelled"
    const reversals = await wallets.reverseOrderDebits({
      reference_id: order.id,
      reason,
    })
    if (reversals.length === 0) {
      logger.info(
        `[wallet:refund] order ${order.id}: no wallet debits found to reverse (already reversed or never debited)`,
      )
      return
    }
    const totalReversed = reversals.reduce(
      (s, r) => s + Number(r.amount_inr),
      0,
    )
    logger.info(
      `[wallet:refund] order ${order.id}: reversed ${reversals.length} debit(s), total ${totalReversed} paise`,
    )
  } catch (err) {
    logger.warn(
      `[wallet:refund] order ${order.id} reversal failed: ${err instanceof Error ? err.message : "unknown"}`,
    )
  }
}

export const config: SubscriberConfig = {
  event: ["order.canceled", "order.refund_created"],
}
