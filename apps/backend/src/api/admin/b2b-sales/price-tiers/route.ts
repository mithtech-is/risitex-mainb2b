import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { B2B_PRICING_MODULE } from "../../../../modules/b2b_pricing"
import { projectTierPriceList } from "../../../../lib/tier-price-list"

/**
 * GET  /admin/b2b-sales/price-tiers   — list tiers (optional ?product_id / ?category_id filter)
 * POST /admin/b2b-sales/price-tiers   — create a tier bracket
 *
 * Part of the B2B Sales admin domain. Tiers drive volume/tier pricing
 * resolved by the b2b_pricing engine.
 */
const CreateSchema = z
  .object({
    product_id: z.string().trim().min(1).nullish(),
    variant_id: z.string().trim().min(1).nullish(),
    category_id: z.string().trim().min(1).nullish(),
    customer_tier_id: z.string().trim().min(1).nullish(),
    region_id: z.string().trim().min(1).nullish(),
    min_quantity: z.number().int().min(1).default(1),
    max_quantity: z.number().int().min(1).nullish(),
    value: z.number().min(0),
    is_percentage: z.boolean().default(false),
  })
  .refine((d) => !d.max_quantity || d.max_quantity >= d.min_quantity, {
    message: "max_quantity must be >= min_quantity",
    path: ["max_quantity"],
  })

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve(B2B_PRICING_MODULE) as any
  const filters: Record<string, unknown> = {}
  if (req.query.product_id) filters.product_id = String(req.query.product_id)
  if (req.query.category_id) filters.category_id = String(req.query.category_id)
  const rows = await svc.listPriceTiers(filters, {
    order: { min_quantity: "ASC" },
  })
  return res.json({ price_tiers: rows })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid price-tier payload",
      errors: parsed.error.flatten(),
    })
  }
  const svc = req.scope.resolve(B2B_PRICING_MODULE) as any
  const [created] = await svc.createPriceTiers([parsed.data])

  // Project product+tier fixed-price brackets into a native price list so the
  // tier price applies at checkout (FR-4.01). Best-effort — a projection
  // failure never blocks the tier create; the engine still resolves for
  // display, and POST /sync-tier-groups + re-save can backfill.
  let price_list_id: string | null = null
  try {
    price_list_id = await projectTierPriceList(req.scope, created)
  } catch {
    /* engine row persisted; projection can be retried */
  }

  return res.json({ price_tier: { ...created, price_list_id } })
}
