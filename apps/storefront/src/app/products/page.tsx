import { redirect } from "next/navigation";

/**
 * The catalogue is consolidated to a single page at /wholesale/catalogue (the
 * full-featured one with search + filters + wholesale/MRP pricing). This legacy
 * /products route now redirects there, preserving any query (e.g. ?cat=men-jeans),
 * so old links and bookmarks keep working.
 */
export default async function ProductsRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }
  const query = qs.toString();
  redirect(`/wholesale/catalogue${query ? `?${query}` : ""}`);
}
