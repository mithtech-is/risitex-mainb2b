import { model } from "@medusajs/framework/utils"

/**
 * Per-tier (or per-customer) product / category visibility — the server-side
 * wholesale-catalog gate (replaces RISITEX's client-only gating). When
 * `target_type` is "product" the rule may be `manual` or `follow_category`
 * (inherit from the product's categories). `visible` false hides the target
 * from the matched audience.
 *
 * Ported from Holisto `b2b_rules` (`customer_group_id` → `customer_tier_id`).
 */
export const ProductVisibilityRule = model.define(
  "b2b_product_visibility_rule",
  {
    id: model.id({ prefix: "pvr" }).primaryKey(),
    target_type: model.enum(["product", "category"]).default("product"),
    product_id: model.text().nullable(),
    category_id: model.text().nullable(),

    /** RISITEX tier token, or null = applies broadly. */
    customer_tier_id: model.text().nullable(),
    /** Narrow the rule to a single customer, if set. */
    specific_customer_id: model.text().nullable(),

    visible: model.boolean().default(true),
    mode: model.enum(["follow_category", "manual"]).default("manual"),
  },
)
