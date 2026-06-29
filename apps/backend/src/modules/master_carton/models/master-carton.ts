import { model } from "@medusajs/framework/utils"

/**
 * Predefined SKU + size-ratio bundle (FR-3.02). One row per
 * marketable carton config — e.g. "PIX Boxer 60u" with a fixed
 * S:M:L:XL:XXL split.
 *
 * `size_ratio` is a JSON map { "S": 6, "M": 14, ... } summing to
 * `total_units`. The matrix-cart route reads this map to expand
 * a single "+1 master carton" click into line items per size.
 *
 * `sku_template` interpolates `{size}` at expansion time so one
 * carton config maps to per-size SKUs (e.g.
 * `PIX-BOXER-NAVY-{size}`).
 *
 * `active=false` hides from the storefront picker without losing
 * the historical config — past orders still resolve their carton
 * via id.
 */
export const MasterCarton = model
  .define("master_carton", {
    id: model.id({ prefix: "mc" }).primaryKey(),

    name: model.text(),
    sku_template: model.text(),

    total_units: model.number(),
    size_ratio: model.json(),

    active: model.boolean().default(true),

    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["active"], unique: false, where: "deleted_at IS NULL" },
    {
      on: ["sku_template"],
      unique: false,
      where: "deleted_at IS NULL",
    },
  ])
