import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../modules/cashfree_wallet"

/**
 * Debits the customer's INR wallet on `order.placed` to settle the
 * wallet portion of a split-payment cart (FR-7.03 + the B2B
 * checkout flow ushered in by Phase 10).
 *
 * Flow:
 *   1. Storefront writes `{ wallet_apply: { amount_paise } }` to
 *      `cart.metadata` via `/store/carts/:id/wallet-apply` (Phase 10).
 *   2. Medusa places the order and copies cart.metadata onto
 *      order.metadata (the complete-cart workflow preserves it).
 *   3. This subscriber reads the intent off `order.metadata` and
 *      calls `cashfree_wallet.debitForOrder()` which handles the
 *      bucket split (promo bucket drains first, then main) under an
 *      optimistic CAS retry loop. Idempotency key is `order_<id>`;
 *      the plugin internally synthesises `order_<id>:promo` for the
 *      promo half. Replays are no-ops.
 *
 * If the wallet has insufficient combined funds we log a warning
 * and do NOT debit. The storefront should re-check balance just
 * before "Place order"; an over-application race is a soft failure
 * — finance reconciles via the Razorpay overcharge or invoice
 * delta. Production hardening: a sync /store/wallet/apply that
 * locks the intent atomically with cart total at submit time.
 *
 * Order total is read via the Query module's `summary.*` projection
 * because `orderService.retrieveOrder` does NOT hydrate virtual
 * totals; reading `order.total` off the raw row returns `undefined`.
 * Discovered the hard way in D:\risitex; carrying the fix forward.
 */
export default async function debitWalletForOrder({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  type OrderLike = {
    id: string
    customer_id: string | null
    currency_code: string
    total: number | string | null
    item_subtotal: number | string | null
    subtotal: number | string | null
    metadata: Record<string, unknown> | null
  }

  let order: OrderLike
  try {
    const { data: rows } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "customer_id",
        "currency_code",
        "total",
        "item_subtotal",
        "subtotal",
        "metadata",
        "summary.*",
      ],
      filters: { id: data.id },
    })
    if (!rows?.length) {
      logger.warn(`[wallet:debit] order ${data.id} not found via query`)
      return
    }
    order = rows[0] as unknown as OrderLike
  } catch (err) {
    logger.warn(
      `[wallet:debit] order ${data.id} not retrievable: ${err instanceof Error ? err.message : err}`,
    )
    return
  }

  const walletApply = (order.metadata?.wallet_apply ?? null) as {
    amount_paise?: number
  } | null
  const amountPaise = Number(walletApply?.amount_paise)
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    return // nothing to debit
  }
  if (!order.customer_id) {
    logger.warn(
      `[wallet:debit] order ${order.id} has wallet_apply but no customer_id; skipping`,
    )
    return
  }

  // `cart_subtotal_inr` is consumed by the plugin to clamp the promo
  // bucket against cashfree_setting.promo_max_*. Order subtotal is
  // already in paise (BIGINT minor units) on the order row.
  const cartSubtotalPaise = Math.max(
    0,
    Math.round(Number(order.item_subtotal ?? order.subtotal ?? order.total ?? 0)),
  )

  const wallets =
    container.resolve<CashfreeWalletService>(CASHFREE_WALLET_MODULE)

  // reference_type + reference_id are critical: the refund subscriber
  // looks up debits by reference_id=<order_id>. Without these,
  // reverseOrderDebits() finds nothing on cancel/refund.
  const result = await wallets.debitForOrder({
    customer_id: order.customer_id,
    amount_inr: amountPaise,
    idempotency_key: `order_${order.id}`,
    cart_subtotal_inr: cartSubtotalPaise,
    reference_type: "order",
    reference_id: order.id,
    note: `Order ${order.id} placement`,
    metadata: { wallet_apply_amount_paise: amountPaise },
    promo_override_inr: null,
  })

  if (!result.ok) {
    // `result` here is one of the failure variants. TS's strict
    // discriminant narrowing fights tsx's loader compile mode, so
    // cast to a permissive shape rather than rely on inference —
    // the plugin's enum is small and stable.
    const failure = result as unknown as {
      reason: string
      balance?: number
      shortfall?: number
    }
    logger.warn(
      `[wallet:debit] order ${order.id} wallet debit failed (${failure.reason}): requested ${amountPaise} paise, available ${failure.balance ?? "?"}, shortfall ${failure.shortfall ?? "?"}`,
    )
    return
  }

  // `result.ok === true` branch — promo + main fields are guaranteed.
  const success = result as unknown as {
    main_amount_inr: number
    promo_amount_inr: number
  }
  logger.info(
    `[wallet:debit] order ${order.id} debited ${amountPaise} paise (main ${success.main_amount_inr}, promo ${success.promo_amount_inr})`,
  )
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
