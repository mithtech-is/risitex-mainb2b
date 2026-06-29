import { model } from "@medusajs/framework/utils"

/**
 * One AND-combined gate on a `DynamicRule` (ported from Holisto `b2b_rules`).
 * All conditions on a rule must pass for the rule to fire (OR is modelled as
 * separate rules). Each condition compares a cart/category/product dimension
 * against a threshold.
 */
export const RuleCondition = model.define("b2b_rule_condition", {
  id: model.id({ prefix: "rcond" }).primaryKey(),
  rule_id: model.text().index(),

  /** Which measurement of the cart this condition reads. */
  dimension: model
    .enum([
      "cart_total_quantity",
      "cart_total_value",
      "category_product_quantity",
      "category_product_value",
      "product_quantity",
      "product_value",
    ])
    .default("cart_total_value"),

  operator: model.enum(["gt", "gte", "lt", "lte", "eq"]).default("gte"),

  /** Compared value (money in MINOR units or a quantity). */
  threshold: model.number().default(0),

  /** Category/product id for the *_product_* dimensions. */
  target_id: model.text().nullable(),
})
