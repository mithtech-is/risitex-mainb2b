import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createRazorpayOrder } from "../../../../../lib/razorpay"
import { logger } from "../../../../../utils/logger"

/**
 * POST /store/purchase-orders/razorpay/order
 *
 * Creates a Razorpay Order for the amount a B2B buyer is about to pay
 * against a purchase order. This route ONLY mints the Razorpay order —
 * it does not look up or mutate any PO/order, and it does not credit
 * anything. The storefront opens Razorpay Checkout with the returned
 * `razorpay_order_id` + `key_id`; on success the buyer's browser hands
 * the signature triple to `POST /store/purchase-orders` (which
 * verifies it and creates the PO/order with `payment_status: "paid"`)
 * — see that route's `payment.method === "razorpay"` branch. The
 * `/webhooks/razorpay` route is the asynchronous backstop for the
 * same reconciliation.
 *
 * Uses the shared `lib/razorpay.ts` helper for both the live-mode
 * REST call and the dev pass-through (no RAZORPAY_KEY_ID/SECRET
 * configured) — no crypto/REST reimplemented here.
 *
 * Auth: the `/store/purchase-orders*` middleware (see
 * `api/middlewares.ts`) already requires an authenticated + verified
 * customer (`authenticate("customer", [...]) + requireVerifiedCustomer`).
 * The in-handler check below is defense-in-depth, matching the sibling
 * PO routes (e.g. `[id]/confirm-payment/route.ts`).
 *
 * Body: { amount_paise: number } — ₹1 minimum, ₹10,00,000 maximum,
 * the same bounds as `/store/wallet/topup`.
 */
const BodySchema = z.object({
  amount_paise: z
    .number()
    .int("amount_paise must be an integer (paise)")
    .min(100, "Minimum amount is ₹1")
    .max(100_000_000, "Maximum amount is ₹10,00,000"),
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
  const { amount_paise } = parsed.data

  // Razorpay caps `receipt` at 40 characters.
  const receipt = `b2b_${customerId.slice(-8)}_${Date.now().toString(36)}`.slice(
    0,
    40,
  )

  try {
    const order = await createRazorpayOrder(amount_paise, receipt, {
      customer_id: customerId,
    })
    // Shape is already exactly {mode, key_id, razorpay_order_id,
    // amount_paise, currency} — see lib/razorpay.ts.
    return res.json(order)
  } catch (err) {
    logger.error("PO razorpay order creation failed", {
      customer_id: customerId,
      error: err instanceof Error ? err.message : String(err),
    })
    return res
      .status(500)
      .json({ message: "Couldn't start Razorpay payment." })
  }
}
