export type DiscountCodeFacts = {
  active: boolean
  expires_at: Date | string | null
  min_order_units: number
}

export type ValidateContext = { cartUnits: number; now: Date }

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: "invalid_code" | "expired" | "usage_exhausted" }
  | { ok: false; reason: "below_min_units"; min: number; have: number }

/**
 * Pure pre-apply check for a discount code. Usage-limit ("usage_exhausted") is
 * NOT decided here — that's owned by Medusa's native promotion limit and
 * surfaced by updateCartPromotionsWorkflow; this covers active/expiry/min-units.
 */
export function validateDiscountCode(
  code: DiscountCodeFacts,
  ctx: ValidateContext,
): ValidationResult {
  if (!code.active) return { ok: false, reason: "invalid_code" }
  if (code.expires_at && new Date(code.expires_at) < ctx.now) {
    return { ok: false, reason: "expired" }
  }
  const min = Number(code.min_order_units ?? 0)
  if (min > 0 && ctx.cartUnits < min) {
    return { ok: false, reason: "below_min_units", min, have: ctx.cartUnits }
  }
  return { ok: true }
}
