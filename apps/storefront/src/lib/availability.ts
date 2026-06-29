import { MEDUSA_BASE_URL } from "@/lib/medusa";

/**
 * FR-9.02 — sellable ("Available" = physical − reserved) stock per SKU.
 *
 * The backend (`GET /store/b2b-sales/availability`) returns one row per SKU;
 * MBOs must only ever order against `available`, never raw physical stock,
 * which would let them buy units already promised to pending Sales Orders.
 */

export type AvailabilityRow = {
  sku: string;
  physical: number | null;
  reserved: number;
  available: number | null;
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/**
 * Fetch availability keyed by SKU. Optionally scope to specific SKUs.
 * Degrades to an empty map if the endpoint isn't available, so callers can
 * fall back to physical stock without breaking.
 */
export async function fetchAvailability(
  skus?: string[],
): Promise<Map<string, AvailabilityRow>> {
  const qs =
    skus && skus.length
      ? `?sku=${encodeURIComponent(skus.join(","))}`
      : "";
  try {
    const res = await fetch(
      `${MEDUSA_BASE_URL}/store/b2b-sales/availability${qs}`,
      {
        headers: { "x-publishable-api-key": PUB_KEY },
        cache: "no-store",
      },
    );
    if (!res.ok) return new Map();
    const body = (await res.json()) as { availability?: AvailabilityRow[] };
    const map = new Map<string, AvailabilityRow>();
    for (const row of body.availability ?? []) {
      if (row?.sku) map.set(row.sku, row);
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Clamp a requested quantity to what's sellable.
 * `available == null` means unmanaged/unknown — no cap is applied.
 */
export function clampToAvailable(
  qty: number,
  available: number | null | undefined,
): number {
  const q = Math.max(0, Math.floor(qty));
  if (available == null) return q;
  return Math.min(q, Math.max(0, available));
}
