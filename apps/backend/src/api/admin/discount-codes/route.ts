import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import {
  DISCOUNT_CODE_MODULE,
  type DiscountCodeModuleService,
} from "../../../modules/discount_code"
import { CAMPAIGN_MODULE } from "../../../modules/campaign"
import type { CampaignModuleService } from "../../../modules/campaign"

const BodySchema = z.object({
  code: z.string().trim().min(2).max(40).transform((v) => v.toUpperCase()),
  discount_type: z.enum(["percentage", "fixed"]),
  value: z.number().int().positive(),
  min_order_units: z.number().int().min(0).default(0),
  max_usage: z.number().int().positive().nullable().default(null),
  expires_at: z.string().datetime().nullable().default(null),
  combinable_with_tier: z.boolean().default(false),
  combinable_tier_ids: z.array(z.string().trim().min(1)).default([]),
  track_as_campaign: z.boolean().default(false),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() })
  }
  const d = parsed.data

  const { result } = await createPromotionsWorkflow(req.scope).run({
    input: {
      promotionsData: [
        {
          code: d.code,
          type: "standard",
          status: "active",
          limit: d.max_usage ?? undefined,
          application_method: {
            type: d.discount_type,
            target_type: "order",
            allocation: "across",
            value: d.value,
            ...(d.discount_type === "fixed" ? { currency_code: "inr" } : {}),
          },
        },
      ],
    },
  })
  const promotion = (result as Array<{ id: string }>)[0]

  let campaignId: string | null = null
  if (d.track_as_campaign) {
    const campaigns = req.scope.resolve<CampaignModuleService>(CAMPAIGN_MODULE)
    const existing = await campaigns.resolveActiveByCode(d.code)
    if (existing) {
      campaignId = existing.id
    } else {
      const [created] = await campaigns.createCampaigns([
        { code: d.code, name: d.code, starts_at: new Date(), active: true },
      ])
      campaignId = created.id
    }
  }

  const svc = req.scope.resolve<DiscountCodeModuleService>(DISCOUNT_CODE_MODULE)
  const [record] = await svc.createDiscountCodes([
    {
      code: d.code,
      promotion_id: promotion.id,
      discount_type: d.discount_type,
      value: d.value,
      min_order_units: d.min_order_units,
      max_usage: d.max_usage,
      expires_at: d.expires_at ? new Date(d.expires_at) : null,
      combinable_with_tier: d.combinable_with_tier,
      // json column is typed as an object, so wrap the id list.
      combinable_tier_ids: d.combinable_tier_ids.length
        ? { ids: d.combinable_tier_ids }
        : null,
      campaign_id: campaignId,
      active: true,
    },
  ])

  return res.json({ discount_code: record })
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve<DiscountCodeModuleService>(DISCOUNT_CODE_MODULE)
  const discount_codes = await svc.listDiscountCodes({})
  return res.json({ discount_codes })
}
