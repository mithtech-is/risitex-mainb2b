import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { B2B_PRICING_MODULE } from "../../../../modules/b2b_pricing"

/**
 * GET  /admin/b2b-sales/visibility-rules  — list visibility rules (optional ?product_id / ?category_id)
 * POST /admin/b2b-sales/visibility-rules  — create a visibility rule
 *
 * Server-side wholesale-catalog gate: hide products/categories from tiers
 * (or everyone) so only entitled B2B buyers see them.
 */
const CreateSchema = z
  .object({
    target_type: z.enum(["product", "category"]).default("product"),
    product_id: z.string().trim().min(1).nullish(),
    category_id: z.string().trim().min(1).nullish(),
    customer_tier_id: z.string().trim().min(1).nullish(),
    specific_customer_id: z.string().trim().min(1).nullish(),
    visible: z.boolean().default(true),
    mode: z.enum(["follow_category", "manual"]).default("manual"),
  })
  .refine(
    (d) =>
      (d.target_type === "product" && d.product_id) ||
      (d.target_type === "category" && d.category_id),
    { message: "product_id (or category_id) required for the target_type" },
  )

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve(B2B_PRICING_MODULE) as any
  const filters: Record<string, unknown> = {}
  if (req.query.product_id) filters.product_id = String(req.query.product_id)
  if (req.query.category_id) filters.category_id = String(req.query.category_id)
  const rows = await svc.listProductVisibilityRules(filters)
  return res.json({ visibility_rules: rows })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid visibility-rule payload",
      errors: parsed.error.flatten(),
    })
  }
  const svc = req.scope.resolve(B2B_PRICING_MODULE) as any
  const [created] = await svc.createProductVisibilityRules([parsed.data])
  return res.json({ visibility_rule: created })
}
