import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CUSTOMER_TIER_MODULE } from "../modules/customer_tier"
import type { CustomerTierModuleService } from "../modules/customer_tier"

/**
 * Seed the three canonical RISITEX customer tiers (FR-1.03).
 * Idempotent — re-running upserts each row keyed on `code`.
 *
 * Run with:
 *   pnpm exec medusa exec ./src/scripts/seed-tiers.ts
 *
 * Default payment terms + commission % are sensible starters; ops
 * can re-tune in /admin/customer-tiers without re-seeding.
 */
export default async function seedTiers({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const tiers = container.resolve<CustomerTierModuleService>(
    CUSTOMER_TIER_MODULE,
  )

  const SEED = [
    {
      code: "local_mbo",
      name: "Local MBO",
      priority: 10,
      default_payment_terms: "advance_100",
      // 5 % is the standard reward we describe in the storefront
      // copy ("earn ₹5,000 on every referred MBO's first ₹100k").
      default_commission_percent: 5,
      active: true,
    },
    {
      code: "high_footfall_mbo",
      name: "High-Footfall MBO",
      priority: 20,
      default_payment_terms: "net_30",
      default_commission_percent: 4,
      active: true,
    },
    {
      code: "regional_distributor",
      name: "Regional Distributor",
      priority: 30,
      default_payment_terms: "net_60",
      default_commission_percent: 3,
      active: true,
    },
  ]

  for (const t of SEED) {
    const row = await tiers.upsertByCode(t)
    logger.info(
      `[seed:tiers] ${row.code} (${row.id}) — priority=${row.priority}, terms=${row.default_payment_terms}, commission=${row.default_commission_percent}%`,
    )
  }
  logger.info(`[seed:tiers] done — ${SEED.length} tiers in place.`)
}
