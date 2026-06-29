import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CAMPAIGN_MODULE, CampaignModuleService } from "../modules/campaign"

/**
 * Campaign attribution (FR-6.02). When an order is placed with a promo code
 * that matches an active offline-campaign code (e.g. GARTEX2026), record a
 * CampaignAttribution so we can track which MBOs acquired at an event actually
 * convert. Idempotent on order_id (the campaign module enforces it).
 */
export default async function campaignForOrder({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const campaigns = container.resolve<CampaignModuleService>(CAMPAIGN_MODULE)

  let order:
    | {
        id: string
        customer_id: string | null
        promotions: { code: string | null }[]
      }
    | undefined
  try {
    const { data: rows } = await query.graph({
      entity: "order",
      fields: ["id", "customer_id", "promotions.code"],
      filters: { id: data.id },
    })
    order = rows?.[0] as any
  } catch (err) {
    logger.warn(
      `[campaign] order ${data.id} not retrievable: ${err instanceof Error ? err.message : err}`,
    )
    return
  }
  if (!order) return

  const codes = (order.promotions ?? [])
    .map((p) => p?.code)
    .filter((c): c is string => !!c)
  if (!codes.length) return

  for (const code of codes) {
    try {
      const campaign = await campaigns.resolveActiveByCode(code)
      if (!campaign) continue
      await campaigns.attribute({
        campaign_id: campaign.id,
        order_id: order.id,
        customer_id: order.customer_id ?? null,
        code,
      })
      logger.info(
        `[campaign] order ${order.id} attributed to campaign ${campaign.code}`,
      )
      break // one attribution per order (also enforced idempotently)
    } catch (err) {
      logger.warn(
        `[campaign] attribution failed for order ${order.id} code ${code}: ${err instanceof Error ? err.message : err}`,
      )
    }
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
