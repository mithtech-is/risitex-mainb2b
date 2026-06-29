import { model } from "@medusajs/framework/utils"

/**
 * Per-account credit policy (FR-4.03). Drives the choice between
 * advance / Net-30 / Net-60 at checkout and the max outstanding
 * cap above which the order is blocked.
 *
 * `code` is the short stable handle ("advance_100", "net_30",
 * "net_60", "vip_net_45" …). The default mapping comes from the
 * customer's tier; ops overrides per-company by setting
 * company.credit_terms_id.
 */
export const CreditTerms = model
  .define("credit_terms", {
    id: model.id({ prefix: "credt" }).primaryKey(),

    code: model.text(),
    name: model.text(),

    days: model.number().default(0),
    advance_pct: model.number().default(100),
    max_outstanding_minor: model.bigNumber().nullable(),

    active: model.boolean().default(true),
    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["code"], unique: true, where: "deleted_at IS NULL" },
    { on: ["active"], unique: false, where: "deleted_at IS NULL" },
  ])
