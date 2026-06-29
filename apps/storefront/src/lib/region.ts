import { MEDUSA_BASE_URL } from "./medusa";

/**
 * Module-level cache for the region id.
 *
 * Medusa V2 needs `region_id` (or `currency_code`) on every
 * /store/products call that selects `*variants.calculated_price` —
 * without it the route returns 400 "Missing required pricing
 * context". Re-fetching /store/regions on every page hit would mean
 * an extra round-trip per render, so we cache the id at module
 * scope on first call.
 *
 * Reset is rarely needed (regions change ~never); the cache lives
 * until the page hard-reloads.
 */

let cached: string | null = null;
let inflight: Promise<string | null> | null = null;

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

export async function getRegionId(): Promise<string | null> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${MEDUSA_BASE_URL}/store/regions`, {
        headers: { "x-publishable-api-key": PUB_KEY },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        regions?: Array<{ id: string; currency_code?: string }>;
      };
      // Prefer the INR region (RISITEX is India-only); fall back to the
      // first region if none match.
      const inr = body.regions?.find(
        (r) => (r.currency_code ?? "").toLowerCase() === "inr",
      );
      const id = inr?.id ?? body.regions?.[0]?.id ?? null;
      cached = id;
      return id;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
