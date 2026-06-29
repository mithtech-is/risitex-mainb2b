import { ExecArgs } from "@medusajs/framework/types"
import { B2B_PRICING_MODULE } from "../modules/b2b_pricing"

/**
 * Functional smoke test for the b2b_pricing engine. Creates a sample
 * product-scoped tier ladder + an MOQ/step rule + a visibility rule,
 * exercises the resolution methods, asserts the expected output, then
 * cleans up. Run: npx medusa exec ./src/scripts/smoke-b2b-pricing.ts
 */
export default async function smoke({ container }: ExecArgs) {
  const svc: any = container.resolve(B2B_PRICING_MODULE)
  const log = (...a: any[]) => console.log("[smoke]", ...a)

  const PRODUCT = "prod_smoke_test"
  const TIER = "ctier_smoke_gold"
  const created: { tiers: string[]; qty: string[]; vis: string[] } = {
    tiers: [],
    qty: [],
    vis: [],
  }

  try {
    // ── Price tiers: a tier-specific ladder + a default ladder ──────
    const tierLadder = await svc.createPriceTiers([
      { product_id: PRODUCT, customer_tier_id: TIER, min_quantity: 1, max_quantity: 11, value: 20000 },
      { product_id: PRODUCT, customer_tier_id: TIER, min_quantity: 12, max_quantity: 47, value: 18000 },
      { product_id: PRODUCT, customer_tier_id: TIER, min_quantity: 48, max_quantity: null, value: 16000 },
      // default ladder (no tier) — should be overridden for TIER buyers
      { product_id: PRODUCT, customer_tier_id: null, min_quantity: 1, max_quantity: null, value: 25000 },
    ])
    created.tiers = tierLadder.map((t: any) => t.id)

    const forTier = await svc.getPriceTiers(PRODUCT, { tier_ids: [TIER] })
    const forGuest = await svc.getPriceTiers(PRODUCT, { tier_ids: [] })

    log("tier ladder (gold):", forTier.map((t: any) => `${t.min_quantity}+→₹${t.value / 100}`).join("  "))
    log("guest ladder      :", forGuest.map((t: any) => `₹${t.value / 100}`).join("  "))

    const assert = (cond: boolean, msg: string) => {
      if (!cond) throw new Error("ASSERT FAILED: " + msg)
      log("✓", msg)
    }
    assert(forTier.length === 3, "gold buyer gets the 3-bracket tier ladder")
    assert(forTier[0].min_quantity === 1 && forTier[0].value === 20000, "first gold bracket is 1+ @ ₹200")
    assert(forTier[2].value === 16000, "deepest gold bracket is ₹160")
    assert(forGuest.length === 1 && forGuest[0].value === 25000, "guest falls back to default ₹250 ladder")

    // ── Quantity rule: MOQ 12, step 6 for the tier ─────────────────
    const q = await svc.createProductQuantityRules([
      { product_id: PRODUCT, customer_tier_id: TIER, min_qty: 12, max_qty: null, step_qty: 6 },
    ])
    created.qty = q.map((r: any) => r.id)
    const moq = await svc.resolveQuantityRule(PRODUCT, [TIER])
    log("resolved MOQ rule:", JSON.stringify({ min: moq?.min_qty, step: moq?.step_qty }))
    assert(moq?.min_qty === 12 && moq?.step_qty === 6, "gold buyer MOQ=12 step=6 resolves")

    // ── Visibility: hide product from everyone except the tier ─────
    const v = await svc.createProductVisibilityRules([
      { target_type: "product", product_id: PRODUCT, customer_tier_id: null, visible: false, mode: "manual" },
      { target_type: "product", product_id: PRODUCT, customer_tier_id: TIER, visible: true, mode: "manual" },
    ])
    created.vis = v.map((r: any) => r.id)
    const visibleToGold = await svc.isProductVisible(PRODUCT, [], [`tier_${TIER}`])
    const visibleToGuest = await svc.isProductVisible(PRODUCT, [], [])
    log("visible to gold:", visibleToGold, " | visible to guest:", visibleToGuest)
    assert(visibleToGold === true, "wholesale product visible to gold tier")
    assert(visibleToGuest === false, "wholesale product hidden from guests (server-side gate)")

    log("ALL ASSERTIONS PASSED ✅")
  } finally {
    // Clean up the synthetic rows so the smoke test is repeatable.
    if (created.tiers.length) await svc.deletePriceTiers(created.tiers)
    if (created.qty.length) await svc.deleteProductQuantityRules(created.qty)
    if (created.vis.length) await svc.deleteProductVisibilityRules(created.vis)
    log("cleaned up", created.tiers.length + created.qty.length + created.vis.length, "rows")
  }
}
