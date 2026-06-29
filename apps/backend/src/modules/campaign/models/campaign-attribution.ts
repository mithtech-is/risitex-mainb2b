import { model } from "@medusajs/framework/utils"
import { Campaign } from "./campaign"

/**
 * One row per (campaign, order) pair — the attribution event.
 * Written by the cart-completes hook when the cart's promotion
 * code resolves to a tracked campaign.
 *
 * Same campaign can attribute many orders from the same customer
 * — this isn't dedup'd at the customer level by design (finance
 * counts every conversion).
 */
export const CampaignAttribution = model
  .define("marketing_campaign_attribution", {
    id: model.id({ prefix: "cmpattr" }).primaryKey(),

    order_id: model.text(),
    customer_id: model.text().nullable(),
    code: model.text(),
    captured_at: model.dateTime(),

    metadata: model.json().nullable(),

    campaign: model.belongsTo(() => Campaign, {
      mappedBy: "attributions",
    }),
  })
  .indexes([
    { on: ["order_id"], unique: false, where: "deleted_at IS NULL" },
    { on: ["customer_id"], unique: false, where: "deleted_at IS NULL" },
  ])
