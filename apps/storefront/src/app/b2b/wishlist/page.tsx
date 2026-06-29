"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Button, EmptyState } from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { WishlistHeart } from "@/components/wishlist/wishlist-heart";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { updateCustomerMetadata } from "@/lib/auth";

const STORAGE_KEY = "risitex-b2b-wishlist";
const EVENT_NAME = "risitex:wishlist-changed";
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

type ProductRow = {
  slug: string;
  name: string;
  eyebrow: string;
  image?: string;
  moq?: number;
  priceMajor?: number;
  unit?: string;
};

function readLocal(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? (parsed.filter((v) => typeof v === "string") as string[])
      : [];
  } catch {
    return [];
  }
}

function writeLocal(slugs: string[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  window.dispatchEvent(new Event(EVENT_NAME));
}

/**
 * Fetch the customer's authoritative wishlist from /store/customers/me.metadata
 * and merge it with local state. The merge is union-on-first-load so a buyer
 * who added items on Device A and signs into Device B sees both lists. After
 * the first sync, local writes flow back via updateCustomerMetadata.
 */
async function fetchRemoteWishlist(token: string | null): Promise<string[]> {
  if (!token) return [];
  try {
    const res = await fetch(`${MEDUSA_BASE_URL}/store/customers/me`, {
      headers: {
        "x-publishable-api-key": PUB_KEY,
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      customer?: { metadata?: { wishlist?: unknown } };
    };
    const list = body.customer?.metadata?.wishlist;
    return Array.isArray(list)
      ? (list.filter((v) => typeof v === "string") as string[])
      : [];
  } catch {
    return [];
  }
}

async function fetchProductsBySlugs(slugs: string[]): Promise<ProductRow[]> {
  if (slugs.length === 0) return [];
  // Use the same publishable key + /store/products endpoint as the catalogue
  // loader. `handle` accepts a CSV (Medusa expands to `handle IN (…)`), so
  // one round-trip resolves the whole list.
  const fields = "id,handle,title,thumbnail,*images,metadata,*variants.calculated_price";
  try {
    const url = `${MEDUSA_BASE_URL}/store/products?handle=${encodeURIComponent(
      slugs.join(","),
    )}&limit=${slugs.length}&fields=${encodeURIComponent(fields)}`;
    const res = await fetch(url, {
      headers: { "x-publishable-api-key": PUB_KEY },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      products?: {
        id: string;
        handle: string;
        title: string;
        thumbnail?: string | null;
        images?: { url?: string }[];
        metadata?: Record<string, unknown> | null;
        variants?: {
          calculated_price?: { calculated_amount?: number | null } | null;
        }[];
      }[];
    };
    return (body.products ?? []).map((p) => {
      const prices = (p.variants ?? [])
        .map((v) => v.calculated_price?.calculated_amount)
        .filter((n): n is number => typeof n === "number");
      const priceMajor = prices.length
        ? Math.round(Math.min(...prices) / 100)
        : undefined;
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      const cat = (meta.category as string | undefined) ?? "Wholesale";
      return {
        slug: p.handle,
        name: p.title,
        eyebrow: `Wholesale · ${cat.charAt(0).toUpperCase()}${cat.slice(1)}`,
        image: p.thumbnail ?? p.images?.[0]?.url ?? "/demo/products/photo-01.jpg",
        moq: Number(meta.moq) || undefined,
        priceMajor,
        unit: cat.toLowerCase().includes("fabric") ? "/ m" : "/ pc",
      };
    });
  } catch {
    return [];
  }
}

export default function WishlistPage() {
  const [slugs, setSlugs] = React.useState<string[]>([]);
  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // One-shot remote+local merge on mount; subsequent updates come from the
  // heart toggle's broadcast.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = window.localStorage.getItem("medusa_auth_token");
        const [local, remote] = await Promise.all([
          Promise.resolve(readLocal()),
          fetchRemoteWishlist(token),
        ]);
        const merged = Array.from(new Set([...remote, ...local]));
        if (cancelled) return;
        writeLocal(merged);
        setSlugs(merged);
        // Persist the merged list back if the local set added anything to the
        // remote one (best-effort; ignore failure when anonymous).
        if (token && merged.length > remote.length) {
          await updateCustomerMetadata({
            metadata: { wishlist: merged },
          }).catch(() => {});
        }
        const rows = await fetchProductsBySlugs(merged);
        if (!cancelled) setProducts(rows);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Could not load your wishlist",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const onChange = () => {
      const next = readLocal();
      setSlugs(next);
      fetchProductsBySlugs(next).then(setProducts).catch(() => {});
      // Mirror to backend (best-effort) so other devices stay in sync.
      const token = window.localStorage.getItem("medusa_auth_token");
      if (token) {
        updateCustomerMetadata({ metadata: { wishlist: next } }).catch(() => {});
      }
    };
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY || e.key === null) onChange();
    });
    return () => {
      cancelled = true;
      window.removeEventListener(EVENT_NAME, onChange);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar
          title="Wishlist"
          subtitle="Products you've saved for future orders"
        />
        <p
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="text-body-sm text-text-muted"
        >
          Loading your wishlist…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Wishlist" subtitle="" />
        <EmptyState
          title="Could not load wishlist"
          description={error}
          action={
            <Button asChild>
              <Link href="/wholesale/catalogue">Browse catalogue</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (slugs.length === 0) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar
          title="Wishlist"
          subtitle="Products you've saved for future orders"
        />
        <EmptyState
          title="Your wishlist is empty"
          description="Tap the heart icon on any catalogue or product page to save it here."
          action={
            <Button asChild>
              <Link href="/wholesale/catalogue">Browse catalogue</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // Some slugs may have been removed from the catalogue since they were
  // wishlisted. Surface a row for every remembered slug — fall back to a
  // minimal "handle no longer available" tile so the buyer can prune it.
  const productBySlug = new Map(products.map((p) => [p.slug, p]));
  const stale = slugs.filter((s) => !productBySlug.has(s));

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Wishlist"
        subtitle={`${slugs.length} ${slugs.length === 1 ? "product" : "products"} saved for future orders`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <article
            key={p.slug}
            className="flex flex-col overflow-hidden rounded-md border border-border-subtle bg-surface-raised"
          >
            <Link
              href={`/wholesale/p/${p.slug}`}
              className="relative block aspect-[4/3] bg-surface-sunken"
            >
              <Image
                src={p.image ?? "/demo/products/photo-01.jpg"}
                alt={p.name}
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            </Link>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <p className="text-micro text-text-muted uppercase tracking-wider">
                {p.eyebrow}
              </p>
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/wholesale/p/${p.slug}`}
                  className="text-heading-sm text-text-primary hover:underline"
                >
                  {p.name}
                </Link>
                <WishlistHeart slug={p.slug} productName={p.name} />
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
                <span className="text-caption text-text-muted">
                  {p.moq ? `MOQ ${p.moq} pcs` : "MOQ on request"}
                  {p.priceMajor ? ` · ₹${p.priceMajor}${p.unit ?? ""}` : ""}
                </span>
                <Button asChild size="sm" variant="secondary">
                  <Link
                    href={`/b2b/purchase-orders/new?product=${encodeURIComponent(
                      p.name,
                    )}&value=${p.priceMajor && p.moq ? p.priceMajor * p.moq : 1000}`}
                  >
                    Draft PO
                  </Link>
                </Button>
              </div>
            </div>
          </article>
        ))}
        {stale.map((s) => (
          <article
            key={s}
            className="flex flex-col gap-3 rounded-md border border-dashed border-border-subtle bg-surface-sunken p-5"
          >
            <p className="text-caption text-text-muted">{s}</p>
            <p className="text-body-sm text-text-secondary">
              This product is no longer available in the catalogue.
            </p>
            <div className="mt-auto">
              <WishlistHeart slug={s} productName={s} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
