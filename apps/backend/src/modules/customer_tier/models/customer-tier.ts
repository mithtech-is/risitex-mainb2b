import { model } from "@medusajs/framework/utils"

/**
 * RISITEX customer tier — the volume-band that drives FR-1.03 +
 * FR-4.01 pricing. Three default tiers are seeded by
 * `src/scripts/seed-tiers.ts`:
 *
 *   local_mbo            — small single-shop MBO (the long tail)
 *   high_footfall_mbo    — busy multi-counter outlets with deeper
 *                          buy quantities
 *   regional_distributor — multi-MBO distributors; deepest discount
 *                          + Net-60 default credit
 *
 * Ops can add more via /admin/customer-tiers. `priority` orders the
 * tiers in the admin picker (higher = more privileged, shown first).
 *
 * `default_payment_terms` is consumed by the checkout-payment-terms
 * resolver in Phase 10 (credit_terms module): new accounts inherit
 * the tier default unless an explicit company.credit_terms_id
 * override exists.
 *
 * `default_commission_percent` is retained for legacy rows; active sales-rep
 * commission percentages live on commission_rule rows.
 */
export const CustomerTier = model
  .define("customer_tier", {
    id: model.id({ prefix: "ctier" }).primaryKey(),

    /**
     * Short stable code. Seed values:
     *   local_mbo, high_footfall_mbo, regional_distributor
     *
     * UNIQUE across non-deleted rows. Used as the join key when
     * mapping tier → Medusa price_list (Phase 4.5).
     */
    code: model.text(),

    /** Display name (e.g. "Local MBO", "Regional Distributor"). */
    name: model.text(),

    /**
     * 0 = lowest. Higher tier wins precedence when a customer
     * matches multiple (only possible if ops mistakenly assigns
     * two). Admin UI sorts pickers by this descending.
     */
    priority: model.number().default(0),

    /**
     * One of: 'advance_100' (default for new MBOs), 'net_30',
     * 'net_60'. Resolved at order time; company.credit_terms_id
     * overrides per-account.
     */
    default_payment_terms: model.text().default("advance_100"),

    /**
     * Legacy default commission rate (0-100). New sales-rep rates are managed
     * through commission_rule rows.
     */
    default_commission_percent: model.number().default(0),

    active: model.boolean().default(true),

    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["code"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { on: ["active"], unique: false, where: "deleted_at IS NULL" },
  ])
