import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

/**
 * POST /store/discount-code/preview  (FR-6.01)
 *
 * Quote a promo code against an estimated order subtotal without minting a
 * real Medusa cart. Used by the PO draft form so buyers can see
 * "Coupon valid: 10% off — discount ₹X" before they commit.
 *
 * Backed entirely by Medusa's NATIVE promotions module — codes are created
 * and managed in the Medusa admin Promotions UI. (The former custom
 * `discount_code` module was removed; native promotions are the single
 * source of truth.)
 *
 * Body:
 *   { code: string, subtotal_paise: number, units?: number }
 *
 * Returns 200:
 *   { ok: true, code, discount_type, value, discount_paise, expires_at, min_order_units }
 * 404 with { ok: false, reason: "invalid_code" }
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

type NativePromotion = {
  id: string
  code?: string | null
  type?: string | null
  status?: string | null
  application_method?: {
    type?: string | null
    value?: number | null
    currency_code?: string | null
  } | null
}

async function lookupNativePromotion(
  scope: MedusaRequest["scope"],
  code: string,
): Promise<NativePromotion | null> {
  try {
    // query.graph so the application_method relation is actually loaded — the
    // module's listPromotions returns only the promotion's own columns, so
    // `application_method` came back undefined and every code 404'd.
    const query = scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "promotion",
      fields: [
        "id",
        "code",
        "status",
        "application_method.type",
        "application_method.value",
        "application_method.currency_code",
      ],
      filters: { code },
    })
    return (data?.[0] as NativePromotion) ?? null
  } catch {
    return null
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ ok: false, reason: "invalid_input" })
  }
  const { code: codeInput, subtotal_paise } = parsed.data

  const native = await lookupNativePromotion(req.scope, codeInput)
  if (!native || native.status !== "active") {
    return res.status(404).json({ ok: false, reason: "invalid_code" })
  }

  const appMethod = native.application_method
  if (!appMethod || !appMethod.type || appMethod.value == null) {
    return res.status(404).json({ ok: false, reason: "invalid_code" })
  }

  const discountType: "percentage" | "fixed" =
    appMethod.type === "percentage" ? "percentage" : "fixed"

  let discount_paise = 0
  if (discountType === "percentage") {
    discount_paise = Math.floor((subtotal_paise * appMethod.value) / 100)
  } else {
    // Fixed amount: application_method.value is in MAJOR units (₹200 → 200),
    // so convert to paise, capped at the subtotal.
    discount_paise = Math.min(
      Math.round(Math.max(0, appMethod.value) * 100),
      subtotal_paise,
    )
  }

  return res.json({
    ok: true,
    code: native.code ?? codeInput,
    discount_type: discountType,
    value: appMethod.value,
    discount_paise,
    expires_at: null,
    min_order_units: 0,
  })
}
