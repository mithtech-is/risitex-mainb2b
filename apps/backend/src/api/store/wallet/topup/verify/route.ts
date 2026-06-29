import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createHmac } from "crypto"
import { z } from "zod"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../../../../../modules/cashfree_wallet"
import { logger } from "../../../../../utils/logger"

/**
 * POST /store/wallet/topup/verify
 *
 * Live-mode companion to /store/wallet/topup. The storefront calls
 * this after Razorpay Checkout fires its success handler — we verify
 * the HMAC triple, then credit the wallet directly so the customer
 * doesn't have to wait for the webhook (which may be blocked in dev
 * or delayed by minutes in prod).
 *
 * Signature scheme (same as checkout verify):
 *   HMAC-SHA256("<order_id>|<payment_id>", RAZORPAY_KEY_SECRET) → hex
 *
 * Idempotency: the wallet `credit` call uses
 * `idempotency_key = topup_rzp_<payment_id>` so duplicate verify
 * calls (re-fire on poll, double-click, browser refresh) are no-ops
 * after the first one. The wallet module returns the existing
 * transaction in that case.
 */

const BodySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  intent_id: z.string().optional(),
  amount_paise: z.number().int().min(100).optional(),
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
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    parsed.data

  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  // Pass-through dev mode: no Razorpay secret configured. /topup
  // already credited the wallet inline, so verify is a no-op here.
  // Storefront shouldn't normally hit this in dev (it returns early
  // on `mode === "dev-pass-through"`), but if it does we don't want
  // to 5xx.
  if (!keySecret) {
    return res.json({
      verified: true,
      mode: "passthrough" as const,
      transaction: null,
    })
  }

  // HMAC verification — same envelope as the checkout flow uses.
  const expected = createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex")
  if (expected !== razorpay_signature) {
    logger.warn?.("[wallet/topup/verify] signature mismatch", {
      customer_id: customerId,
      razorpay_order_id,
    })
    return res.status(403).json({ message: "signature mismatch" })
  }

  // Fetch the payment from Razorpay so we know the captured amount —
  // we never trust the client-supplied `amount_paise`. This also
  // doubles as a liveness check that the payment_id is real.
  let capturedPaise: number
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")
    const rzpRes = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`,
      {
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
      },
    )
    if (!rzpRes.ok) {
      const text = await rzpRes.text()
      throw new Error(`razorpay ${rzpRes.status} ${text.slice(0, 200)}`)
    }
    const payment = (await rzpRes.json()) as {
      amount: number
      status: string
      order_id: string
    }
    if (payment.order_id !== razorpay_order_id) {
      return res
        .status(409)
        .json({ message: "Razorpay payment belongs to a different order" })
    }
    if (payment.status !== "captured" && payment.status !== "authorized") {
      return res.status(409).json({
        message: `Razorpay payment is in status "${payment.status}" — wait a few seconds and retry.`,
      })
    }
    capturedPaise = Number(payment.amount)
    if (!Number.isFinite(capturedPaise) || capturedPaise < 100) {
      throw new Error(`invalid amount ${capturedPaise}`)
    }
  } catch (err) {
    logger.error("[wallet/topup/verify] razorpay lookup failed", {
      customer_id: customerId,
      payment_id: razorpay_payment_id,
      error: (err as Error).message,
    })
    return res.status(502).json({
      message:
        "Couldn't confirm the payment with Razorpay. Try again in a moment.",
    })
  }

  // Credit the wallet. The idempotency_key is bound to the Razorpay
  // payment_id so a webhook + this verify can't double-credit; whichever
  // arrives first wins, the other becomes a no-op returning the same row.
  const walletModule = req.scope.resolve(
    CASHFREE_WALLET_MODULE,
  ) as CashfreeWalletService

  try {
    await walletModule.ensureWallet(customerId).catch(() => null)
    const tx = (await walletModule.credit({
      customer_id: customerId,
      amount_inr: capturedPaise,
      kind: "vba_credit" as any,
      reference_type: "manual",
      reference_id: razorpay_payment_id,
      idempotency_key: `topup_rzp_${razorpay_payment_id}`,
      note: "Razorpay top-up",
    })) as unknown as {
      id?: string
      balance_after?: number
      kind?: string
    }
    return res.json({
      verified: true,
      mode: "live" as const,
      transaction: tx?.id
        ? {
            id: tx.id,
            balance_after: Number(tx.balance_after ?? 0),
            kind: String(tx.kind ?? "vba_credit"),
          }
        : null,
    })
  } catch (err) {
    logger.error("[wallet/topup/verify] credit failed", {
      customer_id: customerId,
      payment_id: razorpay_payment_id,
      error: (err as Error).message,
    })
    return res.status(500).json({
      message:
        "Payment confirmed, but couldn't credit your wallet. Contact support — reference the payment id.",
    })
  }
}
