import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { B2B_PRICING_MODULE } from "../modules/b2b_pricing"
import { DISCOUNT_CODE_MODULE } from "../modules/discount_code"
import { resolveB2BContext } from "./b2b-tier"

/**
 * B2B cart validation (FR-3.03 MOQ enforcement).
 *
 * Two layers:
 *   - Per-product MOQ / max / carton-step, from the b2b_pricing engine
 *     (`resolveQuantityRule`, tier-aware). Applies to whoever a rule targets.
 *   - A wholesale cart-total floor (default 60 units, env `B2B_MIN_CART_UNITS`)
 *     applied ONLY to B2B buyers (a company/tier on the customer)
 *     carts are never floor-blocked.
 */

const B2B_MIN_CART_UNITS = Number(process.env.B2B_MIN_CART_UNITS) || 60

export type CartViolation = {
  type:
    | "min_cart_units"
    | "product_moq"
    | "product_max"
    | "product_step"
    | "promo_tier_conflict"
  message: string
  line_id?: string
  product_id?: string
}

export type CartValidation = {
  ok: boolean
  is_b2b: boolean
  cart_total_units: number
  min_required: number
  violations: CartViolation[]
}

export async function validateB2BCart(
  scope: { resolve: (k: string) => any },
  cartId: string,
): Promise<CartValidation> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "customer_id",
      "items.id",
      "items.quantity",
      "items.title",
      "items.product_id",
      "promotions.code",
      "promotions.is_automatic",
      "promotions.metadata",
    ],
    filters: { id: cartId },
  })
  const cart = carts?.[0] as
    | {
        id: string
        customer_id: string | null
        items: {
          id: string
          quantity: number
          title: string | null
          product_id: string | null
        }[]
        promotions?: {
          code: string | null
          is_automatic: boolean | null
          metadata: Record<string, unknown> | null
        }[]
      }
    | undefined

  if (!cart) {
    return {
      ok: true,
      is_b2b: false,
      cart_total_units: 0,
      min_required: 0,
      violations: [],
    }
  }

  const items = cart.items ?? []
  const ctx = await resolveB2BContext(scope, cart.customer_id ?? null)
  const isB2B = !!ctx.companyId || !!ctx.tierId
  const svc = scope.resolve(B2B_PRICING_MODULE) as any
  const violations: CartViolation[] = []

  // Per-product MOQ / max / step.
  for (const it of items) {
    if (!it.product_id) continue
    const rule = await svc.resolveQuantityRule(it.product_id, ctx.tierIds)
    if (!rule) continue
    const q = Number(it.quantity)
    const name = it.title ?? "Item"
    if (rule.min_qty != null && q < rule.min_qty) {
      violations.push({
        type: "product_moq",
        line_id: it.id,
        product_id: it.product_id,
        message: `${name}: minimum ${rule.min_qty} units (have ${q})`,
      })
    }
    if (rule.max_qty != null && q > rule.max_qty) {
      violations.push({
        type: "product_max",
        line_id: it.id,
        product_id: it.product_id,
        message: `${name}: maximum ${rule.max_qty} units (have ${q})`,
      })
    }
    if (rule.step_qty != null && rule.step_qty > 1 && q % rule.step_qty !== 0) {
      violations.push({
        type: "product_step",
        line_id: it.id,
        product_id: it.product_id,
        message: `${name}: order in multiples of ${rule.step_qty} (have ${q})`,
      })
    }
  }

  // Wholesale cart-total floor — B2B buyers only.
  const totalUnits = items.reduce((s, it) => s + Number(it.quantity || 0), 0)
  if (isB2B && totalUnits < B2B_MIN_CART_UNITS) {
    violations.push({
      type: "min_cart_units",
      message: `Wholesale orders require at least ${B2B_MIN_CART_UNITS} units (cart has ${totalUnits}).`,
    })
  }

  // FR-6.04 exclusivity / stacking matrix: a coded promo (clearance / intro
  // code) can't stack on a B2B buyer's already-discounted tier pricing unless
  // the code authorises it — either `combinable_with_tier` (any tier) or the
  // buyer's tier appears in `combinable_tier_ids` (e.g. allow T1/T2 but not T3).
  // Automatic volume promotions (FR-6.03) are exempt — they're meant to apply.
  if (isB2B) {
    const codes = (cart.promotions ?? [])
      .filter((p) => !p?.is_automatic)
      .map((p) => p?.code ?? "")
      // AUTO_VOL_* are system-applied volume discounts (FR-6.03) — exempt.
      .filter((c) => c && !c.startsWith("AUTO_VOL_"))
    if (codes.length > 0) {
      const discSvc = scope.resolve(DISCOUNT_CODE_MODULE) as {
        resolveActiveByCodes: (
          c: string[],
        ) => Promise<
          Array<{
            code: string
            combinable_with_tier: boolean
            combinable_tier_ids: { ids?: string[] } | null
          }>
        >
      }
      const records = await discSvc.resolveActiveByCodes(codes)
      const buyerTierIds = new Set(ctx.tierIds ?? [])
      const stackable = (code: string): boolean => {
        const rec = records.find(
          (r) => r.code.trim().toUpperCase() === code.trim().toUpperCase(),
        )
        if (!rec) return false
        if (rec.combinable_with_tier) return true
        const allowed = Array.isArray(rec.combinable_tier_ids?.ids)
          ? rec.combinable_tier_ids!.ids!
          : []
        return allowed.some((id) => buyerTierIds.has(id))
      }
      for (const p of cart.promotions ?? []) {
        if (p?.is_automatic) continue
        if ((p?.code ?? "").startsWith("AUTO_VOL_")) continue
        if (!stackable(p?.code ?? "")) {
          violations.push({
            type: "promo_tier_conflict",
            message: `Promo code "${p?.code ?? ""}" can't be combined with your wholesale tier pricing.`,
          })
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    is_b2b: isB2B,
    cart_total_units: totalUnits,
    min_required: isB2B ? B2B_MIN_CART_UNITS : 0,
    violations,
  }
}
