import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { SALES_PERFORMANCE_MODULE } from "../../../../../modules/sales_performance"
import type { SalesPerformanceModuleService } from "../../../../../modules/sales_performance"

const BodySchema = z.object({
  reason: z.string().trim().min(3).max(2000),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "reason is required (3-2000 chars)",
      errors: parsed.error.flatten(),
    })
  }
  const sales = req.scope.resolve<SalesPerformanceModuleService>(
    SALES_PERFORMANCE_MODULE,
  )
  try {
    const updated = await sales.voidCommission({
      record_id: req.params.id,
      reason: parsed.data.reason,
    })
    return res.json({ commission: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return res.status(500).json({ message: msg })
  }
}
