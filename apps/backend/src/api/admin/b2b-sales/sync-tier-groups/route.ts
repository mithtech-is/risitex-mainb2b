import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CUSTOMER_TIER_MODULE } from "../../../../modules/customer_tier"
import {
  ensureTierGroup,
  addCustomerToTierGroup,
} from "../../../../lib/tier-group"

/**
 * POST /admin/b2b-sales/sync-tier-groups
 *
 * Backfill: ensure a native customer group exists for every tier, and add all
 * existing customers (matched by the raw `customer.customer_tier_id` column)
 * to their tier's group. Safe to re-run — idempotent.
 *
 * Returns: { synced: [{ tier, group_id, customers_synced }] }
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const tiers = req.scope.resolve<any>(CUSTOMER_TIER_MODULE)
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
    raw: (sql: string, bindings?: unknown[]) => Promise<any>
  }

  const tierRows = await tiers.listCustomerTiers({})
  const synced: {
    tier: string
    group_id: string
    customers_synced: number
  }[] = []

  for (const t of tierRows) {
    const groupId = await ensureTierGroup(req.scope, t)

    // customer_tier_id is a raw column the Customer module doesn't know about.
    const result = await pg.raw(
      `SELECT id FROM customer WHERE customer_tier_id = ? AND deleted_at IS NULL`,
      [t.id],
    )
    const customers: { id: string }[] = result?.rows ?? result ?? []
    for (const c of customers) {
      await addCustomerToTierGroup(req.scope, c.id, groupId)
    }
    synced.push({
      tier: t.code,
      group_id: groupId,
      customers_synced: customers.length,
    })
  }

  return res.json({ synced })
}
