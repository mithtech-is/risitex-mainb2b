import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  DISCOUNT_CODE_MODULE,
  type DiscountCodeModuleService,
} from "../../../../modules/discount_code"
import { validateDiscountCode } from "../../../../modules/discount_code/validate"

/**
 * POST /store/discount-code/preview  (FR-6.01)
 *
 * Quote a discount code against an estimated order subtotal + unit count
 * without minting a real Medusa cart. Used by the PO draft form so buyers
 * can see "Coupon valid: 10% off — discount ₹X" before they commit.
 *
 * The cart-bound `POST /store/carts/[id]/discount-code` route stays the
 * authoritative apply path — this one is a read-only preview that does NOT
 * mutate any usage counters.
 *
 * Body:
 *   { code: string, subtotal_paise: number, units?: number }
 *
 * Returns 200:
 *   { ok: true, code, discount_type, value, discount_paise, name?, expires_at? }
 * 4xx with { ok: false, reason: "invalid_code" | "expired" | "min_units" | "inactive" }
 */
const BodySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .transform((v) => v.toUpperCase()),
  subtotal_paise: z.number().int().min(0),
  units: z.number().int().min(0).optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ ok: false, reason: "invalid_input" })
  }
  const { code: codeInput, subtotal_paise, units = 0 } = parsed.data

  const svc = req.scope.resolve<DiscountCodeModuleService>(DISCOUNT_CODE_MODULE)
  const code = await svc.resolveActiveByCode(codeInput)
  if (!code) {
    return res.status(404).json({ ok: false, reason: "invalid_code" })
  }

  const check = validateDiscountCode(
    {
      active: code.active,
      expires_at: code.expires_at,
      min_order_units: code.min_order_units,
    },
    { cartUnits: units, now: new Date() },
  )
  if (!check.ok) {
    return res.status(409).json(check)
  }

  // Compute the discount amount the buyer would see at apply time. For
  // `percentage` the value is the percent (0–100); for `fixed` it's already in
  // paise. We never return a negative or larger-than-subtotal discount.
  let discount_paise = 0
  if (code.discount_type === "percentage") {
    discount_paise = Math.floor((subtotal_paise * code.value) / 100)
  } else {
    discount_paise = Math.min(Math.max(0, code.value), subtotal_paise)
  }

  return res.json({
    ok: true,
    code: code.code,
    discount_type: code.discount_type,
    value: code.value,
    discount_paise,
    expires_at: code.expires_at ?? null,
    min_order_units: code.min_order_units ?? 0,
  })
}
