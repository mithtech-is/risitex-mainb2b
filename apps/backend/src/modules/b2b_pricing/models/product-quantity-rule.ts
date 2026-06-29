import { model } from "@medusajs/framework/utils"

/**
 * Per-product (optionally per-variant, optionally per-tier) minimum /
 * maximum / step quantity constraints — RISITEX MOQ + master-carton-step
 * enforcement (FR-3.02). Enforced on the PDP and at cart validation.
 *
 * A null `customer_tier_id` means the default ladder; a tier-specific row
 * overrides it for that tier. Ported from Holisto `b2b_rules`
 * (`customer_group_id` → `customer_tier_id`).
 */
export const ProductQuantityRule = model.define("b2b_product_quantity_rule", {
  id: model.id({ prefix: "pqr" }).primaryKey(),
  product_id: model.text().index(),
  variant_id: model.text().nullable(),
  customer_tier_id: model.text().nullable(),

  /** Minimum order quantity (MOQ). */
  min_qty: model.number().nullable(),
  /** Maximum order quantity, if capped. */
  max_qty: model.number().nullable(),
  /** Order in multiples of this (e.g. master-carton size). */
  step_qty: model.number().nullable(),
})
