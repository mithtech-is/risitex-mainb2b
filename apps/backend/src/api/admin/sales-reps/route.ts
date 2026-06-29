import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { SALES_PERFORMANCE_MODULE } from "../../../modules/sales_performance"
import type { SalesPerformanceModuleService } from "../../../modules/sales_performance"

/**
 * GET  /admin/sales-reps          — list active reps
 * POST /admin/sales-reps          — create a rep
 */
const CreateSchema = z.object({
  employee_id: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(200),
  email: z.string().email().trim().toLowerCase(),
  phone: z.string().trim().max(20).optional(),
  active: z.boolean().default(true),
})

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const sales = req.scope.resolve<SalesPerformanceModuleService>(
    SALES_PERFORMANCE_MODULE,
  )
  const active = (req.query.active ?? "true") !== "false"
  const reps = await sales.listSalesReps(
    active ? { active: true } : {},
    { order: { created_at: "DESC" } },
  )
  return res.json({ sales_reps: reps })
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
    const [rep] = await sales.createSalesReps([parsed.data])
    return res.json({ sales_rep: rep })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (/unique|duplicate/i.test(msg)) {
      return res.status(409).json({
        message:
          "Sales rep with this employee_id or email already exists",
      })
    }
    return res.status(500).json({ message: msg })
  }
}
