"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Button, EmptyState, Input, Label, formatINR } from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { WishlistHeart } from "@/components/wishlist/wishlist-heart";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { updateCustomerMetadata } from "@/lib/auth";
import { addToCart, type CartLine } from "@/lib/cart";
import { createSavedCart, type SavedCartLine } from "@/lib/saved-carts";
import { PRODUCTS } from "@/data/products";
import { ShoppingCart, Save, X, Check } from "lucide-react";

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

// Resolve a wishlist slug from the local demo catalogue (src/data/products).
// The wholesale catalogue is a MERGE of live Medusa products and these
// fixtures (see getWholesaleProducts), so a product a buyer wishlisted may
// only exist as a fixture. Without this fallback such items were wrongly
// flagged "no longer available in the catalogue".
function fixtureRow(slug: string): ProductRow | null {
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) return null;
  return {
    slug: p.slug,
    name: p.name,
    eyebrow: p.eyebrow,
    image: p.image ?? p.images?.[0] ?? "/demo/products/photo-01.jpg",
    moq: p.moq,
    priceMajor: p.priceMajor,
    unit: p.unit ?? "/ pc",
  };
}

async function fetchProductsBySlugs(slugs: string[]): Promise<ProductRow[]> {
  if (slugs.length === 0) return [];
  const fields = "id,handle,title,thumbnail,*images,metadata,*variants.calculated_price";
  let liveRows: ProductRow[] = [];
  try {
    const query = slugs.map((s) => `handle[]=${encodeURIComponent(s)}`).join("&");
    const url = `${MEDUSA_BASE_URL}/store/products?${query}&limit=${slugs.length}&fields=${encodeURIComponent(fields)}`;
    const res = await fetch(url, {
      headers: { "x-publishable-api-key": PUB_KEY },
    });
    if (res.ok) {
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
      liveRows = (body.products ?? []).map((p) => {
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
          eyebrow: `Wholesale \u00b7 ${cat.charAt(0).toUpperCase()}${cat.slice(1)}`,
          image: p.thumbnail ?? p.images?.[0]?.url ?? "/demo/products/photo-01.jpg",
          moq: Number(meta.moq) || undefined,
          priceMajor,
          unit: cat.toLowerCase().includes("fabric") ? "/ m" : "/ pc",
        };
      });
    }
  } catch {
    // fall through to fixtures
  }

  // Backfill any slug the live API didn't return from the demo fixtures so
  // wishlisted fixture products stay clickable instead of showing as stale.
  const found = new Set(liveRows.map((r) => r.slug));
  const fixtureRows = slugs
    .filter((s) => !found.has(s))
    .map(fixtureRow)
    .filter((r): r is ProductRow => r !== null);

  return [...liveRows, ...fixtureRows];
}

export default function WishlistPage() {
  const [slugs, setSlugs] = React.useState<string[]>([]);
  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [addedToCart, setAddedToCart] = React.useState<Set<string>>(new Set());

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
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const handleAddToCart = (p: ProductRow) => {
    const line: CartLine = {
      variantId: p.slug,
      productSlug: p.slug,
      productName: p.name,
      variantTitle: "",
      unitPriceMajor: p.priceMajor ?? 0,
      quantity: p.moq ?? 1,
      moq: p.moq,
    };
    addToCart([line]);
    setAddedToCart((prev) => new Set(prev).add(p.slug));
  };

  const handleSaveWishlistAsCart = async () => {
    if (!saveName.trim() || products.length === 0) return;
    setBusy("save");
    try {
      const lines: SavedCartLine[] = products.map((p) => ({
        variantId: p.slug,
        productSlug: p.slug,
        productName: p.name,
        variantLabel: "",
        swatchHex: "#A0978A",
        pricePerUnitMajor: p.priceMajor ?? 0,
        quantity: p.moq ?? 1,
      }));
      await createSavedCart({ name: saveName.trim(), lines });
      setSaveName("");
      setShowSaveDialog(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save wishlist as cart");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Wishlist" subtitle="Products you've saved for future orders" />
        <p className="text-body-sm text-text-muted">Loading your wishlist\u2026</p>
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
        <B2bTopbar title="Wishlist" subtitle="Products you've saved for future orders" />
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

  const productBySlug = new Map(products.map((p) => [p.slug, p]));
  const stale = slugs.filter((s) => !productBySlug.has(s));

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Wishlist"
        subtitle={`${slugs.length} ${slugs.length === 1 ? "product" : "products"} saved for future orders`}
        rightActions={
          products.length > 0 ? (
            <Button size="sm" onClick={() => setShowSaveDialog(true)}>
              <Save className="mr-1 h-4 w-4" />
              Save as cart
            </Button>
          ) : undefined
        }
      />

      {showSaveDialog && (
        <div className="rounded-lg border border-border-subtle bg-surface-raised p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-body-md font-medium text-text-primary">
              Save wishlist as saved cart
            </p>
            <button
              type="button"
              onClick={() => setShowSaveDialog(false)}
              className="text-text-muted hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="wl-cart-name">Cart name</Label>
              <Input
                id="wl-cart-name"
                value={saveName}
                onChange={(e) => setSaveName(e.currentTarget.value)}
                placeholder="e.g. Wishlist items"
              />
            </div>
            <Button
              onClick={handleSaveWishlistAsCart}
              isLoading={busy === "save"}
              disabled={!saveName.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      )}

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
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                <span className="text-caption text-text-muted">
                  {p.moq ? `MOQ ${p.moq} pcs` : "MOQ on request"}
                  {p.priceMajor ? ` \u00b7 ${formatINR(p.priceMajor)}${p.unit ?? ""}` : ""}
                </span>
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleAddToCart(p)}
                  disabled={addedToCart.has(p.slug)}
                >
                  {addedToCart.has(p.slug) ? (
                    <><Check className="mr-1 h-3.5 w-3.5" /> Added</>
                  ) : (
                    <><ShoppingCart className="mr-1 h-3.5 w-3.5" /> Add to cart</>
                  )}
                </Button>
                <Button asChild size="sm" variant="tertiary">
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
            <Link
              href={`/wholesale/p/${s}`}
              className="text-heading-sm text-text-primary hover:underline"
            >
              {s}
            </Link>
            <p className="text-body-sm text-text-secondary">
              Open the product page to view current availability and pricing.
            </p>
            <div className="mt-auto flex items-center gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link href={`/wholesale/p/${s}`}>View product</Link>
              </Button>
              <WishlistHeart slug={s} productName={s} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
