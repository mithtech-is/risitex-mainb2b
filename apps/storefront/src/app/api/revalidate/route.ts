import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * On-demand ISR revalidation endpoint (RISITEX).
 *
 * The Medusa backend POSTs here whenever a product changes or is deleted (see
 * risitex-v2 `src/subscribers/product-revalidate.ts`), so the storefront's
 * cached pages refresh within seconds instead of waiting out the ISR window.
 *
 * Auth: shared secret in the `x-revalidate-secret` header (REVALIDATE_SECRET,
 * set in both this app's env and the backend's). No secret configured → 503 so
 * a misconfigured deploy fails loud rather than silently accepting anything.
 *
 * Body (any combination):
 *   { handle?: string, tags?: string[], paths?: string[] }
 *
 * A `handle` expands to the product's RISITEX B2B surfaces: home, catalogue,
 * wholesale catalogue + PDP, plus the `products` / `product:<handle>`
 * cache tags.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = process.env.REVALIDATE_SECRET;

export async function POST(req: Request): Promise<NextResponse> {
  if (!SECRET) {
    return NextResponse.json(
      { ok: false, message: "REVALIDATE_SECRET not configured" },
      { status: 503 },
    );
  }
  if (req.headers.get("x-revalidate-secret") !== SECRET) {
    return NextResponse.json(
      { ok: false, message: "unauthorized" },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    handle?: string;
    tags?: string[];
    paths?: string[];
  };

  const tags = new Set<string>();
  const paths = new Set<string>();

  if (typeof body.handle === "string" && body.handle.trim()) {
    const h = body.handle.trim();
    tags.add("products");
    tags.add(`product:${h}`);
    paths.add("/");
    paths.add("/products");
    paths.add("/wholesale/catalogue");
    paths.add(`/wholesale/p/${h}`);
  }
  for (const t of body.tags ?? []) {
    if (typeof t === "string" && t.trim()) tags.add(t.trim());
  }
  for (const p of body.paths ?? []) {
    if (typeof p === "string" && p.trim()) paths.add(p.trim());
  }
  // Nothing specific asked for → bust the listings so a change is never missed.
  if (tags.size === 0 && paths.size === 0) {
    tags.add("products");
    paths.add("/");
    paths.add("/products");
    paths.add("/wholesale/catalogue");
  }

  const revalidated: { tags: string[]; paths: string[] } = {
    tags: [],
    paths: [],
  };
  for (const t of tags) {
    try {
      revalidateTag(t);
      revalidated.tags.push(t);
    } catch {
      /* ignore individual failures */
    }
  }
  for (const p of paths) {
    try {
      revalidatePath(p);
      revalidated.paths.push(p);
    } catch {
      /* ignore individual failures */
    }
  }

  return NextResponse.json({ ok: true, revalidated });
}
