import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { SALES_PERFORMANCE_MODULE } from "../../../modules/sales_performance"
import type { SalesPerformanceModuleService } from "../../../modules/sales_performance"

/**
 * GET /admin/commissions
 *
 * Query:
 *   ?earner_type=sales_rep
 *   ?earner_id=<id>
 *   ?status=pending|paid|void
 *   ?reference_id=<order_id>
 *   ?limit=50&offset=0
 */
const QuerySchema = z.object({
  earner_type: z.enum(["sales_rep"]).optional(),
  earner_id: z.string().optional(),
  status: z.enum(["pending", "paid", "void"]).optional(),
  reference_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = QuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Invalid query", errors: parsed.error.flatten() })
  }
  const { earner_type, earner_id, status, reference_id, limit, offset } =
    parsed.data
  const sales = req.scope.resolve<SalesPerformanceModuleService>(
    SALES_PERFORMANCE_MODULE,
  )
  const filters: Record<string, unknown> = {}
  if (earner_type) filters.earner_type = earner_type
  if (earner_id) filters.earner_id = earner_id
  if (status) filters.status = status
  if (reference_id) filters.reference_id = reference_id

  const [rows, count] = await sales.listAndCountCommissionRecords(filters, {
    take: limit,
    skip: offset,
    order: { earned_at: "DESC" },
  })
  return res.json({ count, commissions: rows })
}
