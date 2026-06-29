import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { SALES_PERFORMANCE_MODULE } from "../../../../../modules/sales_performance"
import type { SalesPerformanceModuleService } from "../../../../../modules/sales_performance"

/**
 * GET  /admin/sales-reps/:id/assignments  — list this rep's active
 *                                            assignments.
 * POST /admin/sales-reps/:id/assignments  — bind the rep to a
 *                                            customer OR a company
 *                                            (exactly one). DB CHECK
 *                                            enforces the XOR.
 *
 * Re-assigning a customer/company: callers should first close the
 * previous assignment (PATCH valid_until=now()) — keeps the audit
 * trail intact.
 */
const CreateSchema = z
  .object({
    customer_id: z.string().min(1).optional(),
    company_id: z.string().min(1).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) => Boolean(v.customer_id) !== Boolean(v.company_id),
    "Exactly one of customer_id / company_id must be set",
  )

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const sales = req.scope.resolve<SalesPerformanceModuleService>(
    SALES_PERFORMANCE_MODULE,
  )
  const rows = await sales.listSalesRepAssignments(
    { sales_rep_id: req.params.id },
    { order: { assigned_at: "DESC" } },
  )
  return res.json({ assignments: rows })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  const sales = req.scope.resolve<SalesPerformanceModuleService>(
    SALES_PERFORMANCE_MODULE,
  )
  try {
    const [created] = await sales.createSalesRepAssignments([
      {
        sales_rep_id: req.params.id,
        customer_id: parsed.data.customer_id ?? null,
        company_id: parsed.data.company_id ?? null,
        notes: parsed.data.notes ?? null,
        assigned_at: new Date(),
      },
    ])
    return res.json({ assignment: created })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return res.status(500).json({ message: msg })
  }
}
