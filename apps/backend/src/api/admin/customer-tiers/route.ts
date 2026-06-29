import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { CUSTOMER_TIER_MODULE } from "../../../modules/customer_tier"
import type { CustomerTierModuleService } from "../../../modules/customer_tier"

/**
 * GET  /admin/customer-tiers — list all tiers (priority DESC).
 * POST /admin/customer-tiers — create a tier.
 *
 * Ops can also re-name / re-prioritise existing tiers via PATCH on
 * the [id] route, but the canonical seed (Local MBO / High-Footfall
 * MBO / Regional Distributor) is the source of truth — additions
 * should be rare.
 */
const CreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "code must be lower-case snake_case"),
  name: z.string().trim().min(2).max(100),
  priority: z.number().int().min(0).max(100).default(0),
  default_payment_terms: z
    .enum(["advance_100", "net_30", "net_60"])
    .default("advance_100"),
  default_commission_percent: z.number().min(0).max(100).default(0),
  active: z.boolean().default(true),
})

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const tiers = req.scope.resolve<CustomerTierModuleService>(
    CUSTOMER_TIER_MODULE,
  )
  const rows = await tiers.listCustomerTiers(
    {},
    { order: { priority: "DESC" } },
  )
  return res.json({ customer_tiers: rows })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid customer-tier payload",
      errors: parsed.error.flatten(),
    })
  }
  const tiers = req.scope.resolve<CustomerTierModuleService>(
    CUSTOMER_TIER_MODULE,
  )
  try {
    const tier = await tiers.upsertByCode(parsed.data)
    return res.json({ customer_tier: tier })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return res.status(500).json({ message: msg })
  }
}
