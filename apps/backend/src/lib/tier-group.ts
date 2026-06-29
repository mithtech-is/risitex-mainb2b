import { Modules } from "@medusajs/framework/utils"
import { CUSTOMER_TIER_MODULE } from "../modules/customer_tier"

/**
 * Tier → native customer-group bridge.
 *
 * RISITEX `customer_tier` is a custom module; native Medusa price lists target
 * native `customer_group`s. To make tier/volume pricing apply at checkout
 * through Medusa's native price calculation, each tier is mirrored to a native
 * customer group ("B2B: <tier name>"), and customers are added to that group
 * when their tier is assigned. The group id is cached on
 * `customer_tier.metadata.customer_group_id`.
 */

type Scope = { resolve: (k: string) => any }
type TierLike = {
  id: string
  name: string
  metadata?: Record<string, any> | null
}

/**
 * Ensure a native customer group exists for the tier and return its id.
 * Idempotent: reuses the cached group on `metadata.customer_group_id`, else a
 * group matching the canonical name, else creates one — then caches the id.
 */
export async function ensureTierGroup(
  scope: Scope,
  tier: TierLike,
): Promise<string> {
  const customer = scope.resolve(Modules.CUSTOMER)
  const tiers = scope.resolve(CUSTOMER_TIER_MODULE)

  const cached = tier.metadata?.customer_group_id as string | undefined
  if (cached) {
    const grp = await customer
      .retrieveCustomerGroup(cached)
      .catch(() => null)
    if (grp) return cached
  }

  const name = `B2B: ${tier.name}`
  const found = await customer.listCustomerGroups({ name })
  let groupId: string
  if (found?.length) {
    groupId = found[0].id
  } else {
    const [created] = await customer.createCustomerGroups([
      { name, metadata: { customer_tier_id: tier.id } },
    ])
    groupId = created.id
  }

  await tiers.updateCustomerTiers([
    {
      id: tier.id,
      metadata: { ...(tier.metadata ?? {}), customer_group_id: groupId },
    },
  ])
  return groupId
}

/**
 * Add a customer to a tier's native group (idempotent — a duplicate
 * membership is swallowed).
 */
export async function addCustomerToTierGroup(
  scope: Scope,
  customerId: string,
  groupId: string,
): Promise<void> {
  const customer = scope.resolve(Modules.CUSTOMER)
  try {
    await customer.addCustomerToGroup({
      customer_id: customerId,
      customer_group_id: groupId,
    })
  } catch {
    // Already a member (unique constraint) — fine.
  }
}

/** Resolve a tier by id then ensure+add the customer to its group. */
export async function syncCustomerTierMembership(
  scope: Scope,
  customerId: string,
  tierId: string,
): Promise<string | null> {
  const tiers = scope.resolve(CUSTOMER_TIER_MODULE)
  const tier = await tiers.retrieveCustomerTier(tierId).catch(() => null)
  if (!tier) return null
  const groupId = await ensureTierGroup(scope, tier)
  await addCustomerToTierGroup(scope, customerId, groupId)
  return groupId
}
