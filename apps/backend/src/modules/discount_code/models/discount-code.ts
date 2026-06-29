import { model } from "@medusajs/framework/utils"

/**
 * PIX discount code (FR-6.01). Pairs a Medusa native Promotion (which owns the
 * discount math + native usage `limit`/`used`) with the constraints Medusa
 * can't express: minimum order UNITS, expiry, campaign link, and the stacking
 * rules (FR-6.04) for whether the code may combine with a B2B buyer's tier
 * pricing — `combinable_with_tier` authorises ALL tiers; otherwise only the
 * tiers listed in `combinable_tier_ids` may stack (e.g. allow T1/T2 but not T3).
 *
 * `code` mirrors the Medusa promotion code (and, when linked, the
 * marketing_campaign code) so the existing campaign-attribution subscriber and
 * the b2b-cart exclusivity check can resolve it.
 */
export const DiscountCode = model
  .define("discount_code", {
    id: model.id({ prefix: "disc" }).primaryKey(),
    code: model.text(),
    promotion_id: model.text(),
    discount_type: model.enum(["percentage", "fixed"]).default("percentage"),
    value: model.number(),
    min_order_units: model.number().default(0),
    max_usage: model.number().nullable(),
    expires_at: model.dateTime().nullable(),
    combinable_with_tier: model.boolean().default(false),
    combinable_tier_ids: model.json().nullable(),
    campaign_id: model.text().nullable(),
    active: model.boolean().default(true),
  })
  .indexes([{ on: ["code"], unique: true, where: "deleted_at IS NULL" }])
