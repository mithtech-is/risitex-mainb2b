import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, PromotionActions } from "@medusajs/framework/utils"
import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"
import {
  DISCOUNT_CODE_MODULE,
  type DiscountCodeModuleService,
} from "../../../../../modules/discount_code"
import { validateDiscountCode } from "../../../../../modules/discount_code/validate"

const BodySchema = z.object({
  code: z.string().trim().min(1).transform((v) => v.toUpperCase()),
})

async function cartUnits(scope: MedusaRequest["scope"], cartId: string): Promise<number> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "items.quantity"],
    filters: { id: cartId },
  })
  const items = (carts?.[0]?.items ?? []) as Array<{ quantity?: number }>
  return items.reduce((s, it) => s + Number(it.quantity ?? 0), 0)
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ ok: false, reason: "invalid_code" })
  }

  const svc = req.scope.resolve<DiscountCodeModuleService>(DISCOUNT_CODE_MODULE)
  const code = await svc.resolveActiveByCode(parsed.data.code)
  if (!code) return res.status(404).json({ ok: false, reason: "invalid_code" })

  const units = await cartUnits(req.scope, cartId)
  const check = validateDiscountCode(
    { active: code.active, expires_at: code.expires_at, min_order_units: code.min_order_units },
    { cartUnits: units, now: new Date() },
  )
  if (!check.ok) return res.status(409).json(check)

  const { result } = await updateCartPromotionsWorkflow(req.scope).run({
    input: { cart_id: cartId, promo_codes: [code.code], action: PromotionActions.ADD },
  })
  const skipped = (result as { skipped_promo_codes?: Array<{ code: string; reason?: string }> })
    ?.skipped_promo_codes ?? []
  if (skipped.length > 0) {
    return res.status(409).json({ ok: false, reason: "usage_exhausted", detail: skipped })
  }

  return res.json({ ok: true, code: code.code })
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const code = (req.query.code as string | undefined)?.toUpperCase()
  await updateCartPromotionsWorkflow(req.scope).run({
    input: {
      cart_id: cartId,
      promo_codes: code ? [code] : [],
      action: PromotionActions.REMOVE,
    },
  })
  return res.json({ ok: true })
}
