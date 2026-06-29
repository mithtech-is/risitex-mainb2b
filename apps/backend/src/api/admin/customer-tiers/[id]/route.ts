import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { CUSTOMER_TIER_MODULE } from "../../../../modules/customer_tier"
import type { CustomerTierModuleService } from "../../../../modules/customer_tier"

const PatchSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  default_payment_terms: z
    .enum(["advance_100", "net_30", "net_60"])
    .optional(),
  default_commission_percent: z.number().min(0).max(100).optional(),
  active: z.boolean().optional(),
})

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const tiers = req.scope.resolve<CustomerTierModuleService>(
    CUSTOMER_TIER_MODULE,
  )
  try {
    const tier = await tiers.retrieveCustomerTier(req.params.id)
    return res.json({ customer_tier: tier })
  } catch {
    return res
      .status(404)
      .json({ message: `Customer tier ${req.params.id} not found` })
  }
}

export const PATCH = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = PatchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid patch",
      errors: parsed.error.flatten(),
    })
  }
  const tiers = req.scope.resolve<CustomerTierModuleService>(
    CUSTOMER_TIER_MODULE,
  )
  try {
    const [updated] = await tiers.updateCustomerTiers([
      { id: req.params.id, ...parsed.data },
    ])
    return res.json({ customer_tier: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return res.status(500).json({ message: msg })
  }
}
