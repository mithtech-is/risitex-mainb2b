import { MedusaService } from "@medusajs/framework/utils"
import { Campaign } from "./models/campaign"
import { CampaignAttribution } from "./models/campaign-attribution"

class CampaignModuleService extends MedusaService({
  Campaign,
  CampaignAttribution,
}) {
  /**
   * Resolve a code (case-insensitive) to its active campaign at a
   * given moment. Null if no campaign matches.
   */
  async resolveActiveByCode(code: string, at: Date = new Date()) {
    const upper = code.trim().toUpperCase()
    if (!upper) return null
    const rows = await this.listCampaigns({ active: true })
    return (
      rows.find(
        (c) =>
          c.code.trim().toUpperCase() === upper &&
          new Date(c.starts_at) <= at &&
          (!c.ends_at || new Date(c.ends_at) >= at),
      ) ?? null
    )
  }

  /**
   * Record an attribution for a (campaign, order) tuple. Idempotent
   * on order_id: if an attribution already exists for this order
   * we return the existing row instead of stacking.
   */
  async attribute(input: {
    campaign_id: string
    order_id: string
    customer_id?: string | null
    code: string
  }) {
    const existing = await this.listCampaignAttributions({
      order_id: input.order_id,
    })
    if (existing.length > 0) return existing[0]!
    const [row] = await this.createCampaignAttributions([
      {
        campaign_id: input.campaign_id,
        order_id: input.order_id,
        customer_id: input.customer_id ?? null,
        code: input.code.trim().toUpperCase(),
        captured_at: new Date(),
      },
    ])
    return row
  }
}

export default CampaignModuleService
