import { NextResponse } from "next/server";
import { getWholesaleProduct } from "@/lib/wholesale-products";
import type { LineRefresh } from "@/lib/cart";

/**
 * POST /api/cart/refresh   body: { slugs: string[] }
 *  → { [slug]: { unitPriceMajor, moq, maxQty, cartonSize } }
 *
 * The client cart stores a price/MOQ snapshot taken at add-time. This route
 * re-reads the CURRENT values for each product from Medusa (server-side, so it
 * uses the internal-key loader and is exempt from the public rate limiter) so
 * an admin changing a MOQ / price rule flows into carts that already hold the
 * product. Runs dynamically — never cached.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let slugs: string[] = [];
  try {
    const body = (await req.json()) as { slugs?: unknown };
    if (Array.isArray(body.slugs)) {
      slugs = body.slugs.filter((s): s is string => typeof s === "string");
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // De-dupe and cap so a malformed cart can't fan out unbounded lookups.
  const unique = Array.from(new Set(slugs)).slice(0, 100);

  const out: Record<string, LineRefresh> = {};
  await Promise.all(
    unique.map(async (slug) => {
      const p = await getWholesaleProduct(slug);
      if (!p) return; // unknown or hidden — leave the line's snapshot as-is
      out[slug] = {
        unitPriceMajor: p.priceMajor,
        moq: p.moq,
        maxQty: p.maxQty,
        cartonSize: p.cartonSize,
      };
    }),
  );

  return NextResponse.json({ lines: out });
}
