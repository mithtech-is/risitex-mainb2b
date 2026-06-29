import { model } from "@medusajs/framework/utils"

/**
 * A quantity-bracket price row — the heart of RISITEX volume/tier pricing
 * (FR-1.03 / FR-4.01). Ported from Holisto `b2b_rules` and adapted to drive
 * off RISITEX `customer_tier` instead of raw native customer groups.
 *
 * Used two ways:
 *   - Standalone per-product / per-category / global tier ladders
 *     (`product_id` / `category_id` set, `rule_id` null).
 *   - Brackets owned by a `tiered_price` DynamicRule (`rule_id` set).
 *
 * Scope precedence at resolution: PRODUCT > CATEGORY > GLOBAL
 * (global = product_id + category_id both null).
 * Bucket precedence: tier+region > tier > region > default.
 *
 * `price_list_id` mirrors a product-scoped tier into a native Medusa Price
 * List so the discount also applies at checkout; the engine stays the
 * source of truth (see service.projectTierToPriceList in a later phase).
 */
export const PriceTier = model.define("b2b_price_tier", {
  id: model.id({ prefix: "ptier" }).primaryKey(),

  /** Owning dynamic rule (for `tiered_price` rules), if any. */
  rule_id: model.text().nullable(),

  /** Per-product / per-variant ladder, if any. */
  product_id: model.text().nullable(),
  variant_id: model.text().nullable(),

  /** Category scope. */
  category_id: model.text().nullable(),

  /**
   * RISITEX customer tier this bracket applies to (soft-FK → customer_tier.id).
   * Null = the default public wholesale ladder. (Holisto's `customer_group_id`
   * → RISITEX `customer_tier_id` per the consolidation brief.)
   */
  customer_tier_id: model.text().nullable(),

  /**
   * Location scope. Null = every region; set = that region's ladder.
   * Region-specific tiers override the region-agnostic ladder.
   */
  region_id: model.text().nullable(),

  min_quantity: model.number().default(1),
  max_quantity: model.number().nullable(),

  /** Price in MINOR units (paise), or a percentage when `is_percentage`. */
  value: model.number().default(0),
  is_percentage: model.boolean().default(false),

  /** Native Medusa Price List mirroring this tier (product scope only). */
  price_list_id: model.text().nullable(),
})
