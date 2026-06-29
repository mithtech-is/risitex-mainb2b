import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { createHmac } from "crypto"

/**
 * POST /store/checkout/razorpay/verify
 *
 * Body: { cart_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *
 * Verifies the (order_id, payment_id, signature) HMAC triple that
 * Razorpay Checkout hands back to the storefront on a successful
 * payment, then marks the cart's Razorpay payment session as
 * `verified` so the next call to `cart.complete()` authorises the
 * session and mints the order.
 *
 * Signature scheme:
 *   HMAC-SHA256("<order_id>|<payment_id>", RAZORPAY_KEY_SECRET)
 *   compared as a hex string against razorpay_signature.
 *
 * The actual payment-session row is updated by re-running the
 * payment_collections update workflow via the payment module's
 * service. We piggyback the verified-flag onto `session.data` so
 * the provider's authorizePayment can check it.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as {
    cart_id?: string
    razorpay_order_id?: string
    razorpay_payment_id?: string
    razorpay_signature?: string
  }
  const {
    cart_id: cartId,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = body
  if (!cartId || !orderId || !paymentId || !signature) {
    return res.status(400).json({
      message:
        "cart_id, razorpay_order_id, razorpay_payment_id and razorpay_signature are required",
    })
  }

  // ── Phase D.2: cart ownership check ───────────────────────────
  // Without this, an authenticated customer who knew (or guessed)
  // another customer's cart_id plus a valid HMAC triple could mark
  // that cart as paid. The /store/checkout* gate already requires a
  // verified session; here we additionally bind the verify action to
  // the cart owner.
  const customerId = (
    req as unknown as {
      auth_context?: { app_metadata?: { customer_id?: string } }
    }
  ).auth_context?.app_metadata?.customer_id
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  try {
    const cartModule = req.scope.resolve("cart") as unknown as {
      retrieveCart: (
        id: string,
        config?: { select?: string[] },
      ) => Promise<{ id: string; customer_id: string | null } | null>
    }
    const cart = await cartModule.retrieveCart(cartId, {
      select: ["id", "customer_id"],
    })
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" })
    }
    if (cart.customer_id && cart.customer_id !== customerId) {
      return res.status(403).json({ message: "Cart belongs to a different customer" })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "cart lookup failed"
    return res.status(500).json({ message })
  }

  // ── Phase D.2: replay protection ──────────────────────────────
  // Re-verifying the SAME (cart, payment_id) is idempotent (returns
  // ok); re-verifying with a DIFFERENT payment_id on an already-
  // verified session is a replay attempt → 409.
  const existingSession = await readRazorpaySession(req, cartId).catch(() => null)
  if (existingSession?.verified === true) {
    if (existingSession.razorpay_payment_id === paymentId) {
      return res.json({
        verified: true,
        mode: existingSession.mode ?? "live",
        idempotent: true,
      })
    }
    return res.status(409).json({
      message:
        "This cart already has a verified payment session with a different payment id.",
      code: "razorpay.verify.replay",
    })
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? ""
  if (!keySecret) {
    // Pass-through dev mode: trust the call so storefront e2e flows
    // work without a Razorpay test account. The provider's authorize
    // method ALSO has pass-through detection, so the marker travels
    // through the session as `mode: "passthrough"`.
    await markSessionVerified(req, cartId, {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      verified: true,
      mode: "passthrough",
    })
    return res.json({ verified: true, mode: "passthrough" })
  }

  const expected = createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex")
  if (expected !== signature) {
    return res.status(403).json({ message: "signature mismatch" })
  }

  try {
    await markSessionVerified(req, cartId, {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      verified: true,
      mode: "live",
    })
    return res.json({ verified: true, mode: "live" })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return res.status(500).json({ message })
  }
}

/**
 * Read the existing Razorpay payment-session data (if any) so we can
 * decide whether the incoming verify is idempotent (same payment_id)
 * or a replay attempt (different payment_id on an already-verified
 * session).
 */
async function readRazorpaySession(
  req: MedusaRequest,
  cartId: string,
): Promise<
  | {
      verified?: boolean
      razorpay_payment_id?: string
      mode?: string
    }
  | null
> {
  const query = req.scope.resolve("query") as unknown as {
    graph: (q: {
      entity: string
      fields: string[]
      filters: Record<string, unknown>
    }) => Promise<{ data: any[] }>
  }
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "payment_collection.payment_sessions.provider_id",
      "payment_collection.payment_sessions.data",
    ],
    filters: { id: cartId },
  })
  const cart = carts[0]
  const sessions = (cart?.payment_collection?.payment_sessions ?? []) as Array<{
    provider_id: string
    data?: Record<string, unknown> | null
  }>
  const session = sessions.find((s) => s.provider_id === "pp_razorpay_razorpay")
  if (!session) return null
  return (session.data ?? null) as
    | { verified?: boolean; razorpay_payment_id?: string; mode?: string }
    | null
}

/**
 * Locate the cart's Razorpay payment session (it was created at
 * `cart.update({}, { with: payment_collection })` time by
 * `initiatePaymentSession({provider_id: "pp_razorpay_razorpay"})`)
 * and merge the verified marker into `data`.
 */
async function markSessionVerified(
  req: MedusaRequest,
  cartId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  // Find the cart's payment_collection via the link service, then
  // update the matching session row directly through the payment
  // module. Going through the module rather than a workflow keeps
  // this route side-effect-light (no order-state churn).
  const query = req.scope.resolve("query") as unknown as {
    graph: (q: {
      entity: string
      fields: string[]
      filters: Record<string, unknown>
    }) => Promise<{ data: any[] }>
  }
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "payment_collection.id",
      "payment_collection.payment_sessions.id",
      "payment_collection.payment_sessions.provider_id",
      "payment_collection.payment_sessions.data",
    ],
    filters: { id: cartId },
  })
  const cart = carts[0]
  const sessions = (cart?.payment_collection?.payment_sessions ?? []) as Array<{
    id: string
    provider_id: string
    data?: Record<string, unknown> | null
  }>
  const session = sessions.find((s) => s.provider_id === "pp_razorpay_razorpay")
  if (!session) {
    throw new Error(
      `cart ${cartId} has no Razorpay payment session — call initiatePaymentSession first`,
    )
  }
  const payment = req.scope.resolve(Modules.PAYMENT) as unknown as {
    updatePaymentSession: (input: {
      id: string
      data: Record<string, unknown>
      currency_code: string
      amount: number
      provider_id: string
    }) => Promise<unknown>
  }
  await payment.updatePaymentSession({
    id: session.id,
    provider_id: "pp_razorpay_razorpay",
    currency_code: ((session.data as Record<string, unknown>)?.currency as string | undefined)?.toLowerCase() ?? "inr",
    amount: Number((session.data as Record<string, unknown>)?.amount_paise ?? 0) / 100,
    data: { ...(session.data ?? {}), ...patch },
  })
}
