/**
 * Pure payment helpers shared by the checkout PO route and the payment
 * settings surface. No Medusa container access — kept unit-testable.
 */

/** Razorpay-style surcharge: `pct`% of the paise total, rounded to paise. */
export function computeGatewayFeePaise(totalPaise: number, pct: number): number {
  const safePct = Number.isFinite(pct) && pct > 0 ? pct : 0
  if (safePct === 0) return 0
  return Math.round((totalPaise * safePct) / 100)
}

/** UPI reference sanity: trimmed, 6–40 chars, alphanumeric only. */
export function isValidUpiTransactionId(value: unknown): boolean {
  if (typeof value !== "string") return false
  const v = value.trim()
  return v.length >= 6 && v.length <= 40 && /^[A-Za-z0-9]+$/.test(v)
}

/** Amounts (paise) match within a tolerance (default 100 paise = ₹1). */
export function amountsMatchPaise(
  a: number,
  b: number,
  tolerancePaise = 100,
): boolean {
  return Math.abs(a - b) <= tolerancePaise
}
