import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
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
 * Looks up codes in the custom `discount_code` table first, then falls back
 * to Medusa native promotions — so codes created directly in the Medusa
 * admin (without a corresponding discount_code row) are still recognised.
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
    const promo = scope.resolve(Modules.PROMOTION) as {
      listPromotions: (
        f: { code: string[] },
        opts?: { take?: number },
      ) => Promise<NativePromotion[]>
    }
    const [match] = await promo.listPromotions({ code: [code] }, { take: 1 })
    return match ?? null
  } catch {
    return null
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ ok: false, reason: "invalid_input" })
  }
  const { code: codeInput, subtotal_paise, units = 0 } = parsed.data

  // 1) Try custom discount_code table first.
  const svc = req.scope.resolve<DiscountCodeModuleService>(DISCOUNT_CODE_MODULE)
  const code = await svc.resolveActiveByCode(codeInput)

  if (code) {
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

  // 2) Fallback: try Medusa native promotion.
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
    discount_paise = Math.min(Math.max(0, appMethod.value), subtotal_paise)
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
