import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createPriceListsWorkflow,
  deletePriceListsWorkflow,
} from "@medusajs/core-flows"
import { CUSTOMER_TIER_MODULE } from "../modules/customer_tier"
import { B2B_PRICING_MODULE } from "../modules/b2b_pricing"
import { ensureTierGroup } from "./tier-group"

/**
 * PriceTier → native Medusa Price List projection (FR-4.01).
 *
 * The b2b_pricing engine is the source of truth for tier ladders, but to make
 * tier prices apply at CHECKOUT we mirror each product+tier fixed-price bracket
 * into a native Price List targeting that tier's customer group. An
 * authenticated B2B buyer in the group then sees the tier price in Medusa's
 * native `calculated_price` automatically — no storefront changes.
 *
 * Only PRODUCT-scoped + TIER-scoped + NON-percentage brackets project (a real
 * per-unit price for a specific group). Percentage discounts, category/global
 * ladders, and the default (no-tier) ladder are NOT projected — they're handled
 * by the engine for display, or belong to the promotions layer (FR-6.x).
 *
 * Amounts are in paise (minor units) — the same unit Medusa stores variant
 * prices in (verified: ₹1199 → 119900), so `value` projects directly.
 */

const CURRENCY = "inr"
type Container = { resolve: (k: string) => any }

type PriceTierRow = {
  id: string
  product_id: string | null
  customer_tier_id: string | null
  region_id: string | null
  min_quantity: number
  max_quantity: number | null
  value: number
  is_percentage: boolean
  price_list_id: string | null
}

/** True when this bracket is eligible to become a native price list. */
function projectable(pt: PriceTierRow): boolean {
  return !!pt.product_id && !!pt.customer_tier_id && !pt.is_percentage
}

/**
 * Create (or replace) the native price list mirroring a price-tier bracket.
 * Stores the resulting `price_list_id` back on the tier row. Returns the id, or
 * null if the bracket isn't projectable / has no variants.
 */
export async function projectTierPriceList(
  container: Container,
  priceTier: PriceTierRow,
): Promise<string | null> {
  if (!projectable(priceTier)) return null

  // Replace any prior projection for this bracket (idempotent re-project).
  if (priceTier.price_list_id) {
    await removeTierPriceList(container, priceTier)
  }

  const tiers = container.resolve(CUSTOMER_TIER_MODULE)
  const tier = await tiers
    .retrieveCustomerTier(priceTier.customer_tier_id)
    .catch(() => null)
  if (!tier) return null

  const groupId = await ensureTierGroup(container, tier)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "variants.id"],
    filters: { id: priceTier.product_id },
  })
  const variantIds: string[] = (products?.[0]?.variants ?? [])
    .map((v: any) => v?.id)
    .filter(Boolean)
  if (!variantIds.length) return null

  const minQ = Number(priceTier.min_quantity) || 1
  const maxQ =
    priceTier.max_quantity == null ? undefined : Number(priceTier.max_quantity)
  const amount = Number(priceTier.value)

  const { result } = await createPriceListsWorkflow(container as any).run({
    input: {
      price_lists_data: [
        {
          title: `B2B ${tier.name} · ${minQ}${maxQ ? `-${maxQ}` : "+"}`,
          description: `Auto-projected tier price (b2b_pricing ${priceTier.id})`,
          type: "override",
          status: "active",
          rules: { "customer.groups.id": [groupId] },
          prices: variantIds.map((variant_id) => ({
            variant_id,
            currency_code: CURRENCY,
            amount,
            min_quantity: minQ,
            ...(maxQ ? { max_quantity: maxQ } : {}),
          })),
        },
      ],
    } as any,
  })

  const priceListId: string | undefined = (result as any)?.[0]?.id
  if (priceListId) {
    const b2b = container.resolve(B2B_PRICING_MODULE)
    await b2b.updatePriceTiers([
      { id: priceTier.id, price_list_id: priceListId },
    ])
  }
  return priceListId ?? null
}

/** Delete the native price list mirroring a price-tier bracket (if any). */
export async function removeTierPriceList(
  container: Container,
  priceTier: { price_list_id: string | null },
): Promise<void> {
  const id = priceTier?.price_list_id
  if (!id) return
  await deletePriceListsWorkflow(container as any)
    .run({ input: { ids: [id] } })
    .catch(() => {
      // Already gone — fine.
    })
}
