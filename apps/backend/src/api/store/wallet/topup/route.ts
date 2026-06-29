import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../../../../modules/cashfree_wallet"
import { logger } from "../../../../utils/logger"

/**
 * POST /store/wallet/topup
 *
 * Instant top-up entry point. Phase H break-fix — this route was
 * missing entirely, which caused the "Instant top-up via UPI/Card"
 * card on /account/wallet to render "Failed to fetch".
 *
 * Two modes:
 *
 *   1. **Live (Razorpay configured)**: creates a Razorpay Order via
 *      the Razorpay REST API and returns `{razorpay: {key_id,
 *      order_id, amount, currency}}`. The storefront opens the
 *      Razorpay Checkout overlay; on success it POSTs the signature
 *      triple to /store/wallet/topup/verify (followup route, not yet
 *      implemented in this turn — for now the live path returns the
 *      Razorpay payload and the storefront handles the rest of the
 *      flow via the existing Razorpay overlay code).
 *
 *   2. **Dev pass-through (no RAZORPAY_KEY_ID)**: directly credits
 *      the customer's wallet via `walletModule.credit()` and returns
 *      the resulting transaction. The storefront treats this as
 *      "already credited" and shows the success state without
 *      opening any payment overlay.
 *
 * Body: { amount_paise: number } (₹1 minimum, ₹10,00,000 maximum)
 *
 * Response shape matches the storefront's `TopupResponse` type.
 */

const BodySchema = z.object({
  amount_paise: z
    .number()
    .int("amount_paise must be an integer (paise)")
    .min(100, "Minimum top-up is ₹1")
    .max(100_000_000, "Maximum per top-up is ₹10,00,000"),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  const amountPaise = parsed.data.amount_paise

  const walletModule = req.scope.resolve(
    CASHFREE_WALLET_MODULE,
  ) as CashfreeWalletService

  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  const liveMode = !!keyId && !!keySecret

  // Make sure the customer has a wallet row before we try to credit
  // it (or before we hand off to Razorpay so verify can find it).
  await walletModule.ensureWallet(customerId).catch(() => null)

  // Intent id is the breadcrumb shared with the verify step (or with
  // the admin audit log in dev pass-through). Server-time-stamped so
  // collision risk is negligible.
  const intentId = `topup_${customerId.slice(-8)}_${Math.floor(Date.now() / 1000).toString(36)}`

  if (!liveMode) {
    // Dev pass-through — credit the wallet immediately so the user
    // can finish testing the flow without configuring Razorpay.
    try {
      const credit = await walletModule.credit({
        customer_id: customerId,
        amount_inr: amountPaise,
        kind: "vba_credit" as any,
        reference_type: "manual",
        reference_id: intentId,
        idempotency_key: intentId,
        note: "Dev pass-through top-up",
      })
      // `credit` returns the transaction row; balance after is on it.
      const tx = credit as unknown as {
        id?: string
        balance_after?: number
        kind?: string
      }
      return res.json({
        mode: "dev-pass-through" as const,
        razorpay: null,
        transaction: tx?.id
          ? {
              id: tx.id,
              balance_after: Number(tx.balance_after ?? 0),
              kind: String(tx.kind ?? "vba_credit"),
            }
          : null,
        intent_id: intentId,
      })
    } catch (err) {
      logger.error("wallet topup (dev) failed", {
        customerId,
        error: (err as Error).message,
      })
      return res.status(500).json({
        message:
          "Couldn't credit the wallet in dev mode. Check the backend logs.",
      })
    }
  }

  // Live mode — mint a Razorpay Order. We talk to Razorpay directly
  // via REST so we don't depend on the payment provider for this
  // (top-up isn't a cart-scoped payment).
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: intentId.slice(0, 40),
        notes: { customer_id: customerId, intent_id: intentId },
      }),
    })
    if (!rzpRes.ok) {
      const text = await rzpRes.text()
      throw new Error(`razorpay ${rzpRes.status} ${text.slice(0, 200)}`)
    }
    const order = (await rzpRes.json()) as { id: string; status: string }
    return res.json({
      mode: "live" as const,
      razorpay: {
        key_id: keyId,
        order_id: order.id,
        amount: amountPaise,
        currency: "INR",
      },
      transaction: null,
      intent_id: intentId,
    })
  } catch (err) {
    logger.error("wallet topup (live) failed", {
      customerId,
      error: (err as Error).message,
    })
    return res.status(502).json({
      message:
        "Couldn't reach Razorpay. Try again in a moment, or contact support.",
    })
  }
}
