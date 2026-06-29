/**
 * FR-6.03 — automatic, no-code volume discounts.
 *
 * Tiers are configured via the B2B_VOLUME_DISCOUNTS env var (a JSON array of
 * { min_units, percent }). When a B2B cart's total units reach a tier's
 * min_units, that tier's percentage applies — applied programmatically by the
 * /store/carts/:id/volume-discount endpoint as an AUTO_VOL_<percent> promotion,
 * so the buyer never enters a code.
 */

export type VolumeTier = { min_units: number; percent: number }

/** Parse the tier config, sorted best-first (highest min_units). Safe on junk. */
export function parseVolumeTiers(raw: string): VolumeTier[] {
  if (!raw || !raw.trim()) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((t) => ({
      min_units: Number((t as VolumeTier)?.min_units),
      percent: Number((t as VolumeTier)?.percent),
    }))
    .filter(
      (t) =>
        Number.isFinite(t.min_units) &&
        t.min_units > 0 &&
        Number.isFinite(t.percent) &&
        t.percent > 0,
    )
    .sort((a, b) => b.min_units - a.min_units)
}

/** Load tiers from the environment. */
export function loadVolumeTiers(): VolumeTier[] {
  return parseVolumeTiers(process.env.B2B_VOLUME_DISCOUNTS ?? "")
}

/**
 * The best tier a cart of `units` qualifies for (highest min_units ≤ units),
 * or null if none. `tiers` need not be pre-sorted.
 */
export function resolveVolumeDiscount(
  units: number,
  tiers: VolumeTier[],
): VolumeTier | null {
  let best: VolumeTier | null = null
  for (const t of tiers) {
    if (units >= t.min_units && (!best || t.min_units > best.min_units)) {
      best = t
    }
  }
  return best
}
