import { model } from "@medusajs/framework/utils"

/**
 * The core B2BKing-style "Dynamic Rule" (ported verbatim from Holisto
 * `b2b_rules`). A single rule answers four questions:
 *   - WHAT does it do?       (`rule_what` — 25 effect types)
 *   - WHO does it apply to?   (`rule_who` + `who_ids`)
 *   - WHAT does it apply to?  (`rule_applies` + `applies_ids`)
 *   - HOW MUCH?              (`how_much` + `value_type`)
 *
 * Optional AND-combined `RuleCondition` rows (cart/category/product
 * thresholds) gate whether a rule fires. `priority` orders conflicting
 * rules (highest wins); per-product `PriceTier` rows override.
 *
 * In RISITEX, `who_ids` group tokens hold `customer_tier` ids.
 */
export const DynamicRule = model.define("b2b_dynamic_rule", {
  id: model.id({ prefix: "dynr" }).primaryKey(),
  title: model.text(),
  enabled: model.boolean().default(true),

  /** The effect this rule produces. All 25 B2BKing rule types. */
  rule_what: model
    .enum([
      "discount_amount",
      "discount_percentage",
      "raise_price",
      "bogo_discount",
      "fixed_price",
      "hidden_price",
      "tiered_price",
      "free_shipping",
      "minimum_order",
      "maximum_order",
      "required_multiple",
      "unpurchasable",
      "tax_exemption_user",
      "tax_exemption",
      "add_tax_percentage",
      "add_tax_amount",
      "replace_prices_quote",
      "quotes_products",
      "set_currency_symbol",
      "payment_method_minmax_order",
      "payment_method_discount",
      "payment_method_restriction",
      "shipping_method_restriction",
      "rename_purchase_order",
      "info_table",
    ])
    .default("discount_percentage"),

  /** Audience selector. `who_ids` holds tier/customer ids when needed. */
  rule_who: model
    .enum([
      "all_registered",
      "everyone_registered_b2b",
      "user_0",
      "multiple",
      "replace_ids",
      "group",
    ])
    .default("all_registered"),
  who_ids: model.json().nullable(),

  /** Scope selector. `applies_ids` holds product/category/tag ids. */
  rule_applies: model
    .enum([
      "cart_total",
      "multiple_options",
      "excluding_multiple_options",
      "category",
      "product",
      "tag",
    ])
    .default("cart_total"),
  applies_ids: model.json().nullable(),

  /** Effect magnitude (money in MINOR units, qty, or percent). */
  how_much: model.number().nullable(),
  value_type: model.enum(["amount", "quantity", "percentage"]).nullable(),

  /** Discount becomes a struck-through sale price on the PDP. */
  discount_show_everywhere: model.boolean().default(false),
  discount_name: model.text().nullable(),
  tax_name: model.text().nullable(),

  /** For payment-method scoped rules. */
  payment_provider_id: model.text().nullable(),

  /** Higher priority wins when rules conflict. */
  priority: model.number().default(0),

  /** Per-type extra options bag (countries, include_shipping, etc.). */
  extra: model.json().nullable(),
})
