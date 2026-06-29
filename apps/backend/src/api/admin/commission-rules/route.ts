import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { SALES_PERFORMANCE_MODULE } from "../../../modules/sales_performance"
import type { SalesPerformanceModuleService } from "../../../modules/sales_performance"

/**
 * GET  /admin/commission-rules — list, optional filter
 *                                ?earner_type=sales_rep&earner_id=…
 *                                &scope=first_order|restock|custom
 *                                &active=true|false
 * POST /admin/commission-rules — create a rule
 */
const CreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  earner_type: z.enum(["sales_rep"]),
  earner_id: z.string().min(1),
  scope: z.enum(["first_order", "restock", "custom"]),
  applies_to_company_id: z.string().nullable().optional(),
  applies_to_customer_tier_id: z.string().nullable().optional(),
  percent: z.number().min(0).max(100).default(0),
  flat_amount_minor: z.number().int().nullable().optional(),
  margin_basis: z.boolean().default(false),
  effective_from: z.string().datetime().optional(),
  effective_to: z.string().datetime().nullable().optional(),
  priority: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
})

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const sales = req.scope.resolve<SalesPerformanceModuleService>(
    SALES_PERFORMANCE_MODULE,
  )
  const filters: Record<string, unknown> = {}
  if (req.query.earner_type) filters.earner_type = req.query.earner_type
  if (req.query.earner_id) filters.earner_id = req.query.earner_id
  if (req.query.scope) filters.scope = req.query.scope
  if (typeof req.query.active === "string")
    filters.active = req.query.active === "true"

  const rows = await sales.listCommissionRules(filters, {
    order: { priority: "DESC" },
  })
  return res.json({ commission_rules: rows })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Invalid rule", errors: parsed.error.flatten() })
  }
  const sales = req.scope.resolve<SalesPerformanceModuleService>(
    SALES_PERFORMANCE_MODULE,
  )
  try {
    const [rule] = await sales.createCommissionRules([
      {
        ...parsed.data,
        applies_to_company_id: parsed.data.applies_to_company_id ?? null,
        applies_to_customer_tier_id:
          parsed.data.applies_to_customer_tier_id ?? null,
        flat_amount_minor: parsed.data.flat_amount_minor ?? null,
        effective_from: parsed.data.effective_from
          ? new Date(parsed.data.effective_from)
          : new Date(),
        effective_to: parsed.data.effective_to
          ? new Date(parsed.data.effective_to)
          : null,
      },
    ])
    return res.json({ commission_rule: rule })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return res.status(500).json({ message: msg })
  }
}
