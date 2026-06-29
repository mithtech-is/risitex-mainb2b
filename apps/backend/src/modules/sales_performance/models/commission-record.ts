import { model } from "@medusajs/framework/utils"
import { CommissionRule } from "./commission-rule"

/**
 * One earned commission instance. Status state machine:
 *
 *   pending → paid    (via markCommissionPaid; links wallet_transaction
 *                       OR ERPNext payroll batch id)
 *   pending → void    (via voidCommission; reason recorded)
 *   paid    → void    (rare: clawback after payout reversal — e.g.
 *                       order canceled after commission was already
 *                       included in a payout)
 *
 * `idempotency_key` is UNIQUE per (earner_type, earner_id) so
 * order-placed-commission retries are no-ops. Convention:
 *   "order_<order_id>"               for first_order / restock
 *
 * `paid_wallet_transaction_id` links to the wallet_transaction row
 * if commission was paid INTO the rep's wallet (rare today; ERPNext
 * payroll is the canonical channel). `paid_payout_id` is the link
 * to the ERPNext payout batch / disbursement id (Phase 8).
 *
 * Cross-module references (`rule_id` is a real FK to CommissionRule
 * via the belongsTo above; `earner_id` / `reference_id` are soft FKs
 * to whichever module owns the entity — we don't use defineLink to
 * keep the modules loadable in any order).
 */
export const CommissionRecord = model
  .define("commission_record", {
    id: model.id({ prefix: "comrec" }).primaryKey(),

    earner_type: model.enum(["sales_rep"]),
    earner_id: model.text(),

    reference_type: model.enum(["order", "refund", "manual"]),
    reference_id: model.text(),

    amount_minor: model.bigNumber(),
    currency_code: model.text().default("inr"),

    status: model.enum(["pending", "paid", "void"]).default("pending"),

    paid_wallet_transaction_id: model.text().nullable(),
    paid_payout_id: model.text().nullable(),

    earned_at: model.dateTime(),
    paid_at: model.dateTime().nullable(),
    voided_at: model.dateTime().nullable(),
    voided_reason: model.text().nullable(),

    idempotency_key: model.text(),

    metadata: model.json().nullable(),

    rule: model.belongsTo(() => CommissionRule, { mappedBy: "records" }),
  })
  .indexes([
    {
      on: ["earner_type", "earner_id", "idempotency_key"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["reference_type", "reference_id"],
      unique: false,
      where: "deleted_at IS NULL",
    },
    {
      on: ["earner_type", "earner_id", "status"],
      unique: false,
      where: "deleted_at IS NULL",
    },
  ])
