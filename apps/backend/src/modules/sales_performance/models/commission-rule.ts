import { model } from "@medusajs/framework/utils"
import { CommissionRecord } from "./commission-record"

/**
 * Commission rule — declarative percentage / flat amount per
 * (earner_type, earner_id, scope).
 *
 * RISITEX uses sales_rep earners for B2B territory and account attribution.
 *
 * `scope` carries FR-8.03's variable rate semantics:
 *
 *   first_order    — buyer's first completed order; pays at
 *                    a higher rate (acquisition incentive).
 *   restock        — repeat orders; lower residual rate.
 *   custom         — ad-hoc, finance-curated rules (e.g. a one-off
 *                    incentive on a strategic key account).
 *
 * `margin_basis` (FR-8.04): when true, computeAmount uses
 * order.item_subtotal MINUS applied discount as the basis, instead
 * of plain subtotal. Keeps payout aligned with net margin when an
 * MBO uses a heavy promo code.
 *
 * `priority` (higher wins) resolves overlaps when more than one rule
 * matches the same (earner, order) — e.g. a generic "restock" rule
 * + a key-account override for the same rep on the same MBO.
 *
 * `effective_from` / `effective_to` gate by order date so finance
 * can phase in new rate tables without touching old commission
 * records.
 */
export const CommissionRule = model
  .define("commission_rule", {
    id: model.id({ prefix: "comrule" }).primaryKey(),

    name: model.text(),

    earner_type: model.enum(["sales_rep"]),
    earner_id: model.text(),

    scope: model.enum([
      "first_order",
      "restock",
      "custom",
    ]),

    /**
     * Optional narrowing: only fires when the order's customer maps
     * to THIS company. Null → all companies of the earner's
     * assignments match.
     */
    applies_to_company_id: model.text().nullable(),

    /**
     * Optional narrowing: only fires for THIS customer_tier (e.g.
     * pay 4% for high_footfall_mbo orders, 5% for local_mbo).
     */
    applies_to_customer_tier_id: model.text().nullable(),

    percent: model.number().default(0),
    flat_amount_minor: model.bigNumber().nullable(),

    margin_basis: model.boolean().default(false),

    effective_from: model.dateTime(),
    effective_to: model.dateTime().nullable(),

    priority: model.number().default(0),
    active: model.boolean().default(true),

    metadata: model.json().nullable(),

    records: model.hasMany(() => CommissionRecord, { mappedBy: "rule" }),
  })
  .indexes([
    {
      on: ["earner_type", "earner_id", "active"],
      unique: false,
      where: "deleted_at IS NULL",
    },
    {
      on: ["applies_to_company_id"],
      unique: false,
      where: "applies_to_company_id IS NOT NULL AND deleted_at IS NULL",
    },
    {
      on: ["applies_to_customer_tier_id"],
      unique: false,
      where:
        "applies_to_customer_tier_id IS NOT NULL AND deleted_at IS NULL",
    },
  ])
