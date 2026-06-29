import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { B2B_PRICING_MODULE } from "../../../../modules/b2b_pricing"

/**
 * GET  /admin/b2b-sales/quantity-rules  — list MOQ/step rules (optional ?product_id)
 * POST /admin/b2b-sales/quantity-rules  — create an MOQ/step rule
 *
 * Min/max/step quantity constraints (MOQ + master-carton step) enforced on
 * the PDP and at cart validation by the b2b_pricing engine.
 */
const CreateSchema = z
  .object({
    product_id: z.string().trim().min(1),
    variant_id: z.string().trim().min(1).nullish(),
    customer_tier_id: z.string().trim().min(1).nullish(),
    min_qty: z.number().int().min(1).nullish(),
    max_qty: z.number().int().min(1).nullish(),
    step_qty: z.number().int().min(1).nullish(),
  })
  .refine((d) => !d.max_qty || !d.min_qty || d.max_qty >= d.min_qty, {
    message: "max_qty must be >= min_qty",
    path: ["max_qty"],
  })

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve(B2B_PRICING_MODULE) as any
  const filters: Record<string, unknown> = {}
  if (req.query.product_id) filters.product_id = String(req.query.product_id)
  const rows = await svc.listProductQuantityRules(filters)
  return res.json({ quantity_rules: rows })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid quantity-rule payload",
      errors: parsed.error.flatten(),
    })
  }
  const svc = req.scope.resolve(B2B_PRICING_MODULE) as any
  const [created] = await svc.createProductQuantityRules([parsed.data])
  return res.json({ quantity_rule: created })
}
