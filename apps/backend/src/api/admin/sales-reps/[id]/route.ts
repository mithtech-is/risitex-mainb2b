import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { SALES_PERFORMANCE_MODULE } from "../../../../modules/sales_performance"
import type { SalesPerformanceModuleService } from "../../../../modules/sales_performance"

const PatchSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  email: z.string().email().trim().toLowerCase().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  active: z.boolean().optional(),
})

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const sales = req.scope.resolve<SalesPerformanceModuleService>(
    SALES_PERFORMANCE_MODULE,
  )
  try {
    const rep = await sales.retrieveSalesRep(req.params.id)
    return res.json({ sales_rep: rep })
  } catch {
    return res
      .status(404)
      .json({ message: `Sales rep ${req.params.id} not found` })
  }
}

export const PATCH = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = PatchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Invalid patch", errors: parsed.error.flatten() })
  }
  const sales = req.scope.resolve<SalesPerformanceModuleService>(
    SALES_PERFORMANCE_MODULE,
  )
  try {
    const [updated] = await sales.updateSalesReps([
      { id: req.params.id, ...parsed.data },
    ])
    return res.json({ sales_rep: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return res.status(500).json({ message: msg })
  }
}
