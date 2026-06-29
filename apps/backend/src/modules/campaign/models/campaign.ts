import { model } from "@medusajs/framework/utils"
import { CampaignAttribution } from "./campaign-attribution"

/**
 * A marketing campaign tracked through discount codes (FR-6.02).
 * E.g. "GARTEX2026" — the system attributes which MBOs were
 * acquired via a specific offline event by the codes they used at
 * order time.
 *
 * `code` is the canonical promo code string (matched
 * case-insensitively at checkout). Codes are unique across active
 * campaigns; an expired campaign frees its code for reuse.
 */
export const Campaign = model
  .define("marketing_campaign", {
    id: model.id({ prefix: "cmpgn" }).primaryKey(),

    code: model.text(),
    name: model.text(),
    source: model.text().nullable(),

    starts_at: model.dateTime(),
    ends_at: model.dateTime().nullable(),

    target_metric: model.text().nullable(),
    active: model.boolean().default(true),

    metadata: model.json().nullable(),

    attributions: model.hasMany(() => CampaignAttribution, {
      mappedBy: "campaign",
    }),
  })
  .indexes([
    { on: ["code"], unique: false, where: "deleted_at IS NULL" },
    { on: ["active"], unique: false, where: "deleted_at IS NULL" },
  ])
