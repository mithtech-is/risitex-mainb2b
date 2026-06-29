# PIX Storefront Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix search click, bulk-order-to-cart, quick reorder, add Save-to-Cart + Bulk Orders page + Questions tab, remove Women section, clean up navbar/homepage UI, remove unused backend artefacts, and run both apps.

**Architecture:** All frontend changes are in `apps/storefront/src`. The Questions feature adds a new MedusaJS 2.0 module (`src/modules/product-questions`) with store-side API routes. Everything else is pure frontend mutation — no new packages needed.

**Tech Stack:** Next.js 15 App Router, Zustand (persist), MedusaJS 2.0, TypeScript, Tailwind CSS, cmdk (command palette), Lucide icons.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `apps/storefront/src/components/site/search-palette.tsx` | Modify | Fix `go()` — push route before closing dialog; add `onKeyDown` to item |
| `apps/storefront/src/components/product/b2b-buy-panel.tsx` | Modify | Fix `::` key separator + add `medusaVariantId` |
| `apps/storefront/src/store/wishlist.ts` | Create | Zustand persist wishlist store |
| `apps/storefront/src/components/product/pdp-buy-form.tsx` | Modify | Add "Save for later" button |
| `apps/storefront/src/components/product/b2b-buy-panel.tsx` | Modify (second pass) | Add "Save for later" button |
| `apps/storefront/src/app/saved/page.tsx` | Create | Saved items page |
| `apps/storefront/src/app/b2b/bulk-orders/page.tsx` | Create | Bulk orders page |
| `apps/storefront/src/components/b2b/b2b-sidebar.tsx` | Modify | Add Bulk Orders + save nav links |
| `apps/storefront/src/app/b2b/reorder/page.tsx` | Modify | Show order cards with Reorder All |
| `apps/backend/src/modules/product-questions/models/product-question.ts` | Create | MikroORM entity |
| `apps/backend/src/modules/product-questions/service.ts` | Create | CRUD service |
| `apps/backend/src/modules/product-questions/index.ts` | Create | Module export |
| `apps/backend/src/api/store/products/[productId]/questions/route.ts` | Create | GET list + POST submit |
| `apps/backend/src/api/admin/product-questions/route.ts` | Create | Admin list + reply |
| `apps/backend/medusa-config.ts` | Modify | Register product-questions module |
| `apps/storefront/src/app/p/[slug]/page.tsx` | Modify | Add Questions accordion section |
| `apps/storefront/src/components/product/questions-form.tsx` | Create | Q&A submission form |
| `apps/storefront/src/components/site/topnav.tsx` | Modify | Remove Women megamenu item |
| `apps/storefront/src/components/site/mobile-menu.tsx` | Modify | Remove Women from NAV array |
| `apps/storefront/src/app/page.tsx` | Modify | Remove Women from CATEGORIES; homepage polish |
| `apps/backend/src/scripts/seed-checkout.ts` | Review/Remove | Remove if demo-only |

---

## Task 1: Fix search bar — products are now clickable

**Root cause:** `go()` calls `setOpen(false)` (closes Dialog, destroying router context) _before_ `router.push()`. In cmdk-inside-Dialog, closing the portal before navigation causes the push to race with unmount. Fix: push first, close second.

**Files:**
- Modify: `apps/storefront/src/components/site/search-palette.tsx`

- [ ] **Step 1: Open the file and fix `go()`**

Replace the `go` function body:

```typescript
// BEFORE (line 62-65)
const go = (href: string) => {
  setOpen(false);
  router.push(href);
};

// AFTER
const go = (href: string) => {
  router.push(href);
  setTimeout(() => setOpen(false), 0);
};
```

- [ ] **Step 2: Verify in browser**

Run `pnpm dev`, open the storefront, press Cmd+K, type a product name, click an item — it must navigate and close the palette.

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/components/site/search-palette.tsx
git commit -m "fix(search): navigate before closing palette so click reliably routes"
```

---

## Task 2: Fix B2B bulk-order-to-cart (key separator bug + medusaVariantId)

**Root cause 1:** The quantities map key is built as `` `${rowId}_${colId}` ``. For single-size products the synthetic row id is `_unit`, making the key `_unit_natural`. `key.split("_")` returns `["", "unit", "natural"]`, so `rowId = ""` — cell lookup always fails and nothing is added to cart.

**Root cause 2:** `medusaVariantId` is never set, so checkout falls back to the ₹1 helper variant instead of the real product price.

**Files:**
- Modify: `apps/storefront/src/components/product/b2b-buy-panel.tsx`

- [ ] **Step 1: Change separator in `handleQty` (line 94)**

```typescript
// BEFORE
const handleQty = (rowId: string, colId: string, qty: number) => {
  setQuantities((prev) => ({ ...prev, [`${rowId}_${colId}`]: qty }));
};

// AFTER
const handleQty = (rowId: string, colId: string, qty: number) => {
  setQuantities((prev) => ({ ...prev, [`${rowId}::${colId}`]: qty }));
};
```

- [ ] **Step 2: Fix key parsing in `handleAdd` (lines 100-123)**

```typescript
// BEFORE
const handleAdd = () => {
  if (!meetsMoq) return;
  for (const [key, qty] of Object.entries(quantities)) {
    if (qty <= 0) continue;
    const [rowId, colId] = key.split("_");
    if (!rowId || !colId) continue;
    const cell = cells.find((c) => c.rowId === rowId && c.colId === colId);
    if (!cell?.variantId) continue;
    const variant = product.variants.find((v) => v.id === cell.variantId) as
      | Variant
      | undefined;
    if (!variant) continue;
    const swatch = product.swatches.find((s) => s.value === variant.colour);
    add({
      variantId: variant.id,
      productSlug: product.slug,
      productName: `${product.name} (wholesale)`,
      variantLabel:
        (variant.size !== "—" ? `${variant.size} · ` : "") +
        (swatch?.name ?? variant.colour),
      swatchHex: swatch?.hex ?? "#000000",
      pricePerUnitMajor: currentTier?.pricePerUnitMajor ?? product.priceMajor,
      quantity: qty,
    });
  }
  setQuantities({});
};

// AFTER
const handleAdd = () => {
  if (!meetsMoq) return;
  for (const [key, qty] of Object.entries(quantities)) {
    if (qty <= 0) continue;
    const sep = key.indexOf("::");
    if (sep < 0) continue;
    const rowId = key.slice(0, sep);
    const colId = key.slice(sep + 2);
    if (!rowId || !colId) continue;
    const cell = cells.find((c) => c.rowId === rowId && c.colId === colId);
    if (!cell?.variantId) continue;
    const variant = product.variants.find((v) => v.id === cell.variantId) as
      | Variant
      | undefined;
    if (!variant) continue;
    const swatch = product.swatches.find((s) => s.value === variant.colour);
    const isMedusa = variant.id.startsWith("variant_");
    add({
      variantId: variant.id,
      ...(isMedusa ? { medusaVariantId: variant.id } : {}),
      productSlug: product.slug,
      productName: `${product.name} (wholesale)`,
      variantLabel:
        (variant.size !== "—" ? `${variant.size} · ` : "") +
        (swatch?.name ?? variant.colour),
      swatchHex: swatch?.hex ?? "#000000",
      pricePerUnitMajor: currentTier?.pricePerUnitMajor ?? product.priceMajor,
      quantity: qty,
    });
  }
  setQuantities({});
};
```

- [ ] **Step 3: Verify in browser**

Open a product PDP, enter quantities in the matrix grid, click "Add to quote" — the cart drawer must slide open and show the items.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/components/product/b2b-buy-panel.tsx
git commit -m "fix(b2b-panel): use :: separator for matrix key so _unit row IDs work; add medusaVariantId"
```

---

## Task 3: Save-to-Cart wishlist store

**Files:**
- Create: `apps/storefront/src/store/wishlist.ts`

- [ ] **Step 1: Create the wishlist Zustand store**

```typescript
// apps/storefront/src/store/wishlist.ts
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WishlistItem = {
  productSlug: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  swatchHex: string;
  pricePerUnitMajor: number;
  savedAt: string; // ISO string
};

type WishlistState = {
  items: WishlistItem[];
  add: (item: Omit<WishlistItem, "savedAt">) => void;
  remove: (variantId: string) => void;
  has: (variantId: string) => boolean;
  clear: () => void;
};

export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],

      add: (item) =>
        set((s) => {
          const exists = s.items.some((i) => i.variantId === item.variantId);
          if (exists) return s;
          return {
            items: [
              ...s.items,
              { ...item, savedAt: new Date().toISOString() },
            ],
          };
        }),

      remove: (variantId) =>
        set((s) => ({
          items: s.items.filter((i) => i.variantId !== variantId),
        })),

      has: (variantId) => get().items.some((i) => i.variantId === variantId),

      clear: () => set({ items: [] }),
    }),
    { name: "risitex-wishlist" },
  ),
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/storefront/src/store/wishlist.ts
git commit -m "feat(wishlist): add Zustand persist wishlist store"
```

---

## Task 4: Save-to-Cart button on PDP (B2C buy form)

**Files:**
- Modify: `apps/storefront/src/components/product/pdp-buy-form.tsx`

- [ ] **Step 1: Import wishlist store and add button**

Add this import at the top:
```typescript
import { useWishlist } from "@/store/wishlist";
import { Bookmark, BookmarkCheck } from "lucide-react";
```

Inside `PdpBuyForm`, after the `add` line:
```typescript
const saveToWishlist = useWishlist((s) => s.add);
const isSaved = useWishlist((s) => s.has(variant?.id ?? ""));
const removeFromWishlist = useWishlist((s) => s.remove);

const handleSave = () => {
  if (!variant || !swatch) return;
  if (isSaved) {
    removeFromWishlist(variant.id);
  } else {
    saveToWishlist({
      productSlug: product.slug,
      productName: product.name,
      variantId: variant.id,
      variantLabel,
      swatchHex: swatch.hex,
      pricePerUnitMajor: product.priceMajor,
    });
  }
};
```

Replace the buttons section (the two-button `div` at the bottom of PdpBuyForm) with:
```tsx
<div className="flex flex-col gap-2 pt-2">
  <Button
    size="lg"
    disabled={!canBuy}
    onClick={handleAdd}
  >
    {canBuy ? "Add to cart" : "Notify me when in stock"}
  </Button>
  <Button
    variant="secondary"
    size="lg"
    disabled={!canBuy}
    onClick={handleBuyNow}
  >
    Buy now
  </Button>
  <Button
    variant="ghost"
    size="lg"
    disabled={!variant}
    onClick={handleSave}
    className="flex items-center gap-2"
  >
    {isSaved ? (
      <>
        <BookmarkCheck className="h-4 w-4" />
        Saved for later
      </>
    ) : (
      <>
        <Bookmark className="h-4 w-4" />
        Save for later
      </>
    )}
  </Button>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/storefront/src/components/product/pdp-buy-form.tsx
git commit -m "feat(pdp): add Save for later button wired to wishlist store"
```

---

## Task 5: Save-to-Cart button on B2B buy panel

**Files:**
- Modify: `apps/storefront/src/components/product/b2b-buy-panel.tsx`

- [ ] **Step 1: Add save button below the "Add to quote" button**

Add imports at the top of b2b-buy-panel.tsx:
```typescript
import { useWishlist } from "@/store/wishlist";
import { Bookmark } from "lucide-react";
```

Inside `B2bBuyPanel`, after the `add` line:
```typescript
const saveToWishlist = useWishlist((s) => s.add);
```

Add a `handleSave` function:
```typescript
const handleSave = () => {
  for (const [key, qty] of Object.entries(quantities)) {
    if (qty <= 0) continue;
    const sep = key.indexOf("::");
    if (sep < 0) continue;
    const rowId = key.slice(0, sep);
    const colId = key.slice(sep + 2);
    const cell = cells.find((c) => c.rowId === rowId && c.colId === colId);
    if (!cell?.variantId) continue;
    const variant = product.variants.find((v) => v.id === cell.variantId) as Variant | undefined;
    if (!variant) continue;
    const swatch = product.swatches.find((s) => s.value === variant.colour);
    saveToWishlist({
      productSlug: product.slug,
      productName: product.name,
      variantId: variant.id,
      variantLabel:
        (variant.size !== "—" ? `${variant.size} · ` : "") +
        (swatch?.name ?? variant.colour),
      swatchHex: swatch?.hex ?? "#000000",
      pricePerUnitMajor: currentTier?.pricePerUnitMajor ?? product.priceMajor,
    });
  }
};
```

In the stats box button row, add a second button after "Add to quote":
```tsx
<div className="mt-6 flex flex-wrap items-center gap-3">
  <Button
    size="lg"
    disabled={!meetsMoq || totalQty === 0}
    onClick={handleAdd}
  >
    {totalQty === 0
      ? "Add quantities first"
      : meetsMoq
        ? `Add to quote · ${totalQty.toLocaleString()} pcs`
        : `${(moq - totalQty).toLocaleString()} pcs to MOQ`}
  </Button>
  <Button
    variant="secondary"
    size="lg"
    disabled={totalQty === 0}
    onClick={handleSave}
    className="flex items-center gap-2"
  >
    <Bookmark className="h-4 w-4" />
    Save to cart
  </Button>
  <span className="text-caption text-text-muted">
    MOQ {moq.toLocaleString()} pcs · Lead {product.leadTimeDays ?? "—"} days
  </span>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/storefront/src/components/product/b2b-buy-panel.tsx
git commit -m "feat(b2b-panel): add Save to cart button for saving matrix selections to wishlist"
```

---

## Task 6: Saved items page

**Files:**
- Create: `apps/storefront/src/app/saved/page.tsx`

- [ ] **Step 1: Create the saved items page**

```typescript
// apps/storefront/src/app/saved/page.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@risitex/ui/components";
import { useWishlist } from "@/store/wishlist";
import { useCart } from "@/store/cart";
import { Container } from "@/components/site/container";
import { Bookmark, ShoppingBag, X } from "lucide-react";
import { formatINR } from "@risitex/ui/components";

export default function SavedPage() {
  const { items, remove } = useWishlist();
  const add = useCart((s) => s.add);

  const handleAddToCart = (item: typeof items[number]) => {
    add({
      variantId: item.variantId,
      productSlug: item.productSlug,
      productName: item.productName,
      variantLabel: item.variantLabel,
      swatchHex: item.swatchHex,
      pricePerUnitMajor: item.pricePerUnitMajor,
      quantity: 1,
    });
  };

  return (
    <Container>
      <div className="py-10">
        <div className="mb-8 flex items-center gap-3">
          <Bookmark className="h-5 w-5 text-text-muted" />
          <h1 className="text-heading-xl text-text-primary">
            Saved for later
          </h1>
          <span className="text-body-sm text-text-muted">
            ({items.length} {items.length === 1 ? "item" : "items"})
          </span>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <Bookmark className="h-10 w-10 text-text-muted" />
            <p className="text-body-lg text-text-secondary">
              Nothing saved yet.
            </p>
            <p className="text-body-md text-text-muted">
              Hit the &quot;Save for later&quot; button on any product page.
            </p>
            <Button asChild>
              <Link href="/shop">Browse products</Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-raised">
            {items.map((item) => (
              <div
                key={item.variantId}
                className="flex items-center gap-4 px-5 py-4"
              >
                <div
                  className="h-10 w-10 flex-shrink-0 rounded-md ring-1 ring-border-subtle"
                  style={{ background: item.swatchHex }}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/p/${item.productSlug}`}
                    className="text-body-md font-medium text-text-primary hover:underline"
                  >
                    {item.productName}
                  </Link>
                  <p className="text-caption text-text-muted">
                    {item.variantLabel}
                  </p>
                </div>
                <span className="text-body-md text-text-primary">
                  {formatINR(item.pricePerUnitMajor)}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleAddToCart(item)}
                    className="flex items-center gap-1.5"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    Add to cart
                  </Button>
                  <button
                    type="button"
                    onClick={() => remove(item.variantId)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-sunken hover:text-text-primary transition-colors duration-fast"
                    aria-label="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
```

- [ ] **Step 2: Add "Saved" link to topnav**

In `apps/storefront/src/components/site/topnav.tsx`, add a saved-items icon button in the right icon cluster (after `WalletIconButton`, before `CartIconButton`):

```tsx
// Add import at top
import { Bookmark } from "lucide-react";

// In the right icon cluster div:
<Link
  href="/saved"
  aria-label="Saved items"
  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary"
>
  <Bookmark className="h-[18px] w-[18px]" />
</Link>
```

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/app/saved/page.tsx apps/storefront/src/components/site/topnav.tsx
git commit -m "feat(saved): saved items page + wishlist icon in topnav"
```

---

## Task 7: Fix Quick Reorder — show actual orders, not just variants

**Problem:** Users see a flat list of variants from the last 180 days. They want to see their actual orders (order ID, date, items, total) with a "Reorder all" button.

**Files:**
- Modify: `apps/storefront/src/app/b2b/reorder/page.tsx`

- [ ] **Step 1: Restructure the page to show orders**

Replace the entire page content after the imports with this new implementation. Keep all the type definitions and helper functions (`variantOption`, `variantLabelOf`, `swatchOf`, `moqOf`, `fetchProductsRaw`). Replace `buildReorderRows` and the page component:

```typescript
// Add Order-level type
type OrderWithDetail = {
  id: string;
  displayId: string;
  createdAt: string;
  total: number;
  items: Array<{
    variantId: string;
    sku: string;
    productName: string;
    variantLabel: string;
    swatchHex: string;
    unitPriceMajor: number;
    quantity: number;
    moq: number;
  }>;
};

function buildOrderDetails(products: Product[], orders: Order[]): OrderWithDetail[] {
  const variantToProduct = new Map<string, { p: Product; v: ProductVariant }>();
  for (const p of products) {
    for (const v of p.variants ?? []) {
      variantToProduct.set(v.id, { p, v });
    }
  }

  const result: OrderWithDetail[] = [];
  for (const o of orders) {
    const items: OrderWithDetail["items"] = [];
    for (const it of o.items ?? []) {
      const vId = it.variant_id;
      if (!vId) continue;
      const qty = Number(it.quantity ?? 0);
      if (qty <= 0) continue;
      const lookup = variantToProduct.get(vId);
      const unit = Number(it.unit_price ?? (it.subtotal != null && qty > 0 ? Number(it.subtotal) / qty : 0));
      items.push({
        variantId: vId,
        sku: lookup?.v.sku ?? it.variant_sku ?? vId,
        productName: lookup?.p.title ?? it.title ?? "Unknown product",
        variantLabel: lookup ? variantLabelOf(lookup.v) : "Default",
        swatchHex: lookup ? swatchOf(lookup.v) : "#A0978A",
        unitPriceMajor: unit,
        quantity: qty,
        moq: lookup ? moqOf(lookup.v, lookup.p) : 1,
      });
    }
    if (items.length === 0) continue;
    result.push({
      id: o.id,
      displayId: `RST-${(o as Record<string,unknown>).display_id ?? o.id.slice(-6)}`,
      createdAt: o.created_at,
      total: items.reduce((s, i) => s + i.unitPriceMajor * i.quantity, 0),
      items,
    });
  }
  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export default function B2bReorderPage() {
  const add = useCart((s) => s.add);
  const [products, setProducts] = React.useState<Product[] | null>(null);
  const [orders, setOrders] = React.useState<Order[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchProductsRaw().catch(() => [] as Product[]),
      medusa()
        .store.order.list({
          limit: 200,
          fields:
            "id,display_id,created_at,total,items.id,items.variant_id,items.variant_sku,items.title,items.quantity,items.unit_price,items.subtotal",
        } as Record<string, unknown>)
        .then((r) => (r as { orders?: Order[] }).orders ?? [])
        .catch((err: unknown) => {
          const msg = (err as Error).message ?? "";
          if (/401|Not authenticated/i.test(msg)) throw err;
          return [] as Order[];
        }),
    ])
      .then(([ps, os]) => {
        if (cancelled) return;
        setProducts(ps);
        setOrders(os);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = (err as Error).message ?? "";
        setError(
          /401|Not authenticated/i.test(msg)
            ? "Sign in to see your order history."
            : msg || "Couldn't load orders."
        );
        setProducts([]);
        setOrders([]);
      });
    return () => { cancelled = true; };
  }, []);

  const orderDetails = React.useMemo(
    () => buildOrderDetails(products ?? [], orders ?? []),
    [products, orders]
  );

  const filtered = orderDetails.filter(
    (o) =>
      !q ||
      o.displayId.toLowerCase().includes(q.toLowerCase()) ||
      o.items.some(
        (i) =>
          i.productName.toLowerCase().includes(q.toLowerCase()) ||
          i.sku.toLowerCase().includes(q.toLowerCase())
      )
  );

  const handleReorderAll = (order: OrderWithDetail) => {
    for (const it of order.items) {
      add({
        variantId: it.variantId,
        medusaVariantId: it.variantId.startsWith("variant_") ? it.variantId : undefined,
        productSlug: it.variantId,
        productName: it.productName,
        variantLabel: it.variantLabel,
        swatchHex: it.swatchHex,
        pricePerUnitMajor: it.unitPriceMajor,
        quantity: Math.max(it.quantity, it.moq),
      });
    }
  };

  const isLoading = (products === null || orders === null) && !error;

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title="Quick reorder"
          subtitle="Repeat a past order in one click"
        />
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      )}

      <div className="mb-4 flex items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          leftAdornment={<Search className="h-4 w-4" />}
          placeholder="Search by order ID or product…"
          className="max-w-md"
        />
      </div>

      {isLoading ? (
        <p className="py-12 text-body-md text-text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title="No orders yet"
          description="Once you've placed a wholesale order it will appear here for one-click reordering."
          action={
            <Button asChild>
              <Link href="/wholesale/catalogue">Browse catalogue</Link>
            </Button>
          }
          className="mt-4"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border border-border-subtle bg-surface-raised"
            >
              <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-body-sm text-text-primary">
                    {order.displayId}
                  </span>
                  <span className="text-caption text-text-muted">
                    {new Date(order.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="text-caption text-text-muted">
                    · {order.items.reduce((s, i) => s + i.quantity, 0).toLocaleString()} pcs
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-body-sm font-medium text-text-primary">
                    {formatINR(Math.round(order.total))}
                  </span>
                  <Button size="sm" onClick={() => handleReorderAll(order)}>
                    Reorder all
                  </Button>
                </div>
              </div>
              <div className="divide-y divide-border-subtle">
                {order.items.map((item) => (
                  <div
                    key={item.variantId}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <div
                      className="h-6 w-6 flex-shrink-0 rounded ring-1 ring-border-subtle"
                      style={{ background: item.swatchHex }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm text-text-primary">{item.productName}</p>
                      <p className="text-caption text-text-muted">{item.variantLabel}</p>
                    </div>
                    <span className="font-mono text-caption text-text-muted">
                      {item.sku}
                    </span>
                    <span className="text-body-sm text-text-secondary">
                      {item.quantity.toLocaleString()} pcs
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        add({
                          variantId: item.variantId,
                          medusaVariantId: item.variantId.startsWith("variant_") ? item.variantId : undefined,
                          productSlug: item.variantId,
                          productName: item.productName,
                          variantLabel: item.variantLabel,
                          swatchHex: item.swatchHex,
                          pricePerUnitMajor: item.unitPriceMajor,
                          quantity: Math.max(item.quantity, item.moq),
                        })
                      }
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Clean up unused imports**

Remove the now-unused `QuickReorderRow`, `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` imports. Add `formatINR` if not already imported.

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/app/b2b/reorder/page.tsx
git commit -m "fix(reorder): show full order cards with Reorder All instead of flat variant list"
```

---

## Task 8: Bulk Orders page

**Files:**
- Create: `apps/storefront/src/app/b2b/bulk-orders/page.tsx`
- Modify: `apps/storefront/src/components/b2b/b2b-sidebar.tsx`

- [ ] **Step 1: Create the bulk orders page**

```typescript
// apps/storefront/src/app/b2b/bulk-orders/page.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import {
  Button,
  EmptyState,
  Input,
  formatINR,
} from "@risitex/ui/components";
import { Search, Package2 } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { medusa, MEDUSA_BASE_URL } from "@/lib/medusa";
import { getRegionId } from "@/lib/region";
import { useCart } from "@/store/cart";

// Bulk order threshold — show only orders with >= this many total units
const BULK_THRESHOLD = 30;

type OrderItem = {
  id: string;
  variant_id?: string | null;
  variant_sku?: string | null;
  title?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  subtotal?: number | null;
  metadata?: Record<string, unknown> | null;
};

type Order = {
  id: string;
  display_id?: number | null;
  created_at: string;
  status?: string | null;
  fulfillment_status?: string | null;
  total?: number | null;
  items?: OrderItem[] | null;
};

type BulkOrderRow = {
  id: string;
  displayId: string;
  createdAt: string;
  status: string;
  fulfillmentStatus: string;
  totalPcs: number;
  totalAmount: number;
  items: Array<{
    variantId: string;
    sku: string;
    title: string;
    quantity: number;
    unitPrice: number;
    inStock: boolean;
  }>;
};

async function fetchOrders(): Promise<Order[]> {
  const r = await medusa()
    .store.order.list({
      limit: 250,
      fields:
        "id,display_id,status,fulfillment_status,created_at,total," +
        "items.id,items.variant_id,items.variant_sku,items.title,items.quantity,items.unit_price,items.subtotal",
    } as Record<string, unknown>);
  return ((r as { orders?: Order[] }).orders ?? []);
}

async function fetchStock(variantIds: string[]): Promise<Set<string>> {
  if (variantIds.length === 0) return new Set();
  const regionId = await getRegionId();
  const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";
  const params = new URLSearchParams({ limit: "100" });
  if (regionId) params.set("region_id", regionId);
  try {
    const res = await fetch(`${MEDUSA_BASE_URL}/store/products?${params}`, {
      headers: { "x-publishable-api-key": PUB_KEY },
      cache: "no-store",
    });
    if (!res.ok) return new Set(variantIds); // optimistic
    const body = (await res.json()) as { products?: Array<{ variants?: Array<{ id: string; inventory_quantity?: number | null }> }> };
    const inStock = new Set<string>();
    for (const p of body.products ?? []) {
      for (const v of p.variants ?? []) {
        if ((v.inventory_quantity ?? 1) > 0) inStock.add(v.id);
      }
    }
    return inStock;
  } catch {
    return new Set(variantIds);
  }
}

function toBulkRows(orders: Order[], inStock: Set<string>): BulkOrderRow[] {
  return orders
    .map((o) => {
      const items = (o.items ?? [])
        .filter((i) => Number(i.quantity ?? 0) > 0)
        .map((i) => ({
          variantId: i.variant_id ?? i.id,
          sku: i.variant_sku ?? i.id,
          title: i.title ?? "Unknown",
          quantity: Number(i.quantity ?? 0),
          unitPrice: Number(i.unit_price ?? (i.subtotal != null ? Number(i.subtotal) / Math.max(Number(i.quantity ?? 1), 1) : 0)),
          inStock: inStock.has(i.variant_id ?? ""),
        }));
      const totalPcs = items.reduce((s, i) => s + i.quantity, 0);
      return {
        id: o.id,
        displayId: `RST-${o.display_id ?? o.id.slice(-6)}`,
        createdAt: o.created_at,
        status: o.status ?? "—",
        fulfillmentStatus: o.fulfillment_status ?? "—",
        totalPcs,
        totalAmount: Number(o.total ?? items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)),
        items,
      };
    })
    .filter((o) => o.totalPcs >= BULK_THRESHOLD)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export default function BulkOrdersPage() {
  const add = useCart((s) => s.add);
  const [rows, setRows] = React.useState<BulkOrderRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    fetchOrders()
      .then(async (orders) => {
        const allVariantIds = orders.flatMap(
          (o) => (o.items ?? []).map((i) => i.variant_id ?? "").filter(Boolean)
        );
        const inStock = await fetchStock(allVariantIds);
        if (!cancelled) setRows(toBulkRows(orders, inStock));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = (err as Error).message ?? "";
        setError(
          /401|Not authenticated/i.test(msg)
            ? "Sign in to view bulk orders."
            : "Couldn't load orders."
        );
        setRows([]);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = (rows ?? []).filter(
    (o) =>
      !q ||
      o.displayId.toLowerCase().includes(q.toLowerCase()) ||
      o.items.some((i) => i.title.toLowerCase().includes(q.toLowerCase()))
  );

  const handleReorderAll = (row: BulkOrderRow) => {
    for (const item of row.items) {
      if (!item.inStock) continue;
      add({
        variantId: item.variantId,
        medusaVariantId: item.variantId.startsWith("variant_") ? item.variantId : undefined,
        productSlug: item.variantId,
        productName: item.title,
        variantLabel: item.sku,
        swatchHex: "#A0978A",
        pricePerUnitMajor: item.unitPrice,
        quantity: item.quantity,
      });
    }
  };

  const isLoading = rows === null && !error;

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title="Bulk orders"
          subtitle={`Orders with ${BULK_THRESHOLD}+ units — reorder when stock is available`}
        />
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      )}

      <div className="mb-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          leftAdornment={<Search className="h-4 w-4" />}
          placeholder="Search order ID or product…"
          className="max-w-md"
        />
      </div>

      {isLoading ? (
        <p className="py-12 text-body-md text-text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package2 className="h-5 w-5" />}
          title="No bulk orders yet"
          description={`Orders with ${BULK_THRESHOLD} or more units appear here for one-click reorder.`}
          action={
            <Button asChild>
              <Link href="/wholesale/catalogue">Browse catalogue</Link>
            </Button>
          }
          className="mt-4"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border border-border-subtle bg-surface-raised"
            >
              {/* Order header */}
              <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-body-sm font-medium text-text-primary">
                    {order.displayId}
                  </span>
                  <span className="text-caption text-text-muted">
                    {new Date(order.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-micro text-text-secondary">
                    {order.totalPcs.toLocaleString()} pcs
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-body-sm font-medium text-text-primary">
                    {formatINR(Math.round(order.totalAmount))}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleReorderAll(order)}
                    disabled={order.items.every((i) => !i.inStock)}
                  >
                    Reorder in-stock
                  </Button>
                </div>
              </div>

              {/* Line items */}
              <div className="divide-y divide-border-subtle">
                {order.items.map((item) => (
                  <div
                    key={item.variantId}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm text-text-primary">{item.title}</p>
                      <p className="font-mono text-caption text-text-muted">{item.sku}</p>
                    </div>
                    <span className="text-body-sm text-text-secondary">
                      {item.quantity.toLocaleString()} pcs
                    </span>
                    <span className="text-body-sm text-text-secondary">
                      {formatINR(Math.round(item.unitPrice))} / pc
                    </span>
                    <span
                      className={
                        "text-caption " +
                        (item.inStock
                          ? "text-feedback-success-text"
                          : "text-feedback-error-text")
                      }
                    >
                      {item.inStock ? "In stock" : "Out of stock"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Add Bulk Orders to B2B sidebar (below Quick Reorder)**

In `apps/storefront/src/components/b2b/b2b-sidebar.tsx`, add `Package2` to imports and insert a new sidebar item:

```typescript
// Add to lucide imports
import {
  LayoutDashboard,
  Boxes,
  RotateCcw,
  ListOrdered,
  ShoppingBasket,
  FileText,
  CreditCard,
  Wallet,
  Sparkles,
  Truck,
  CalendarClock,
  Package2,         // ← ADD
} from "lucide-react";

// In GROUPS, under "Buying":
{
  heading: "Buying",
  items: [
    { href: "/b2b/inventory", label: "Inventory", icon: <Boxes /> },
    { href: "/b2b/reorder", label: "Quick reorder", icon: <RotateCcw /> },
    { href: "/b2b/bulk-orders", label: "Bulk orders", icon: <Package2 /> },  // ← ADD
    { href: "/b2b/carts", label: "Saved carts", icon: <ShoppingBasket /> },
    { href: "/b2b/backorders", label: "Backorders", icon: <CalendarClock /> },
  ],
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/app/b2b/bulk-orders/page.tsx apps/storefront/src/components/b2b/b2b-sidebar.tsx
git commit -m "feat(b2b): add Bulk Orders page (30+ unit orders) with per-line reorder + sidebar link"
```

---

## Task 9: Questions tab on product pages (backend module)

**Files:**
- Create: `apps/backend/src/modules/product-questions/models/product-question.ts`
- Create: `apps/backend/src/modules/product-questions/service.ts`
- Create: `apps/backend/src/modules/product-questions/index.ts`
- Create: `apps/backend/src/api/store/products/[productId]/questions/route.ts`
- Create: `apps/backend/src/api/admin/product-questions/route.ts`
- Modify: `apps/backend/medusa-config.ts`

- [ ] **Step 1: Create the MikroORM model**

```typescript
// apps/backend/src/modules/product-questions/models/product-question.ts
import { model } from "@medusajs/framework/utils";

export const ProductQuestion = model.define("product_question", {
  id: model.id().primaryKey(),
  product_id: model.text().index(),
  customer_name: model.text(),
  customer_email: model.text(),
  question: model.text(),
  answer: model.text().nullable(),
  is_public: model.boolean().default(false),
  created_at: model.dateTime(),
  updated_at: model.dateTime(),
  answered_at: model.dateTime().nullable(),
});
```

- [ ] **Step 2: Create the service**

```typescript
// apps/backend/src/modules/product-questions/service.ts
import { MedusaService } from "@medusajs/framework/utils";
import { ProductQuestion } from "./models/product-question";

class ProductQuestionsService extends MedusaService({
  ProductQuestion,
}) {}

export default ProductQuestionsService;
```

- [ ] **Step 3: Create the module index**

```typescript
// apps/backend/src/modules/product-questions/index.ts
import ProductQuestionsService from "./service";
import { Module } from "@medusajs/framework/utils";

export const PRODUCT_QUESTIONS_MODULE = "product_questions";

export default Module(PRODUCT_QUESTIONS_MODULE, {
  service: ProductQuestionsService,
});
```

- [ ] **Step 4: Register module in medusa-config.ts**

Open `apps/backend/medusa-config.ts`. In the `modules` array, add:

```typescript
{
  resolve: "./src/modules/product-questions",
},
```

- [ ] **Step 5: Create the store API route**

```typescript
// apps/backend/src/api/store/products/[productId]/questions/route.ts
import {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { PRODUCT_QUESTIONS_MODULE } from "../../../../../modules/product-questions";
import type ProductQuestionsService from "../../../../../modules/product-questions/service";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { productId } = req.params as { productId: string };
  const svc = req.scope.resolve<ProductQuestionsService>(PRODUCT_QUESTIONS_MODULE);
  const questions = await svc.listProductQuestions(
    { product_id: productId, is_public: true },
    { order: { created_at: "DESC" }, take: 20 }
  );
  res.json({ questions });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { productId } = req.params as { productId: string };
  const { customer_name, customer_email, question } = req.body as {
    customer_name: string;
    customer_email: string;
    question: string;
  };

  if (!customer_name?.trim() || !customer_email?.trim() || !question?.trim()) {
    return res.status(400).json({ message: "name, email and question are required" });
  }

  const svc = req.scope.resolve<ProductQuestionsService>(PRODUCT_QUESTIONS_MODULE);
  const created = await svc.createProductQuestions({
    product_id: productId,
    customer_name: customer_name.trim(),
    customer_email: customer_email.trim().toLowerCase(),
    question: question.trim(),
    is_public: false,
    created_at: new Date(),
    updated_at: new Date(),
  });
  res.status(201).json({ question: created });
}
```

- [ ] **Step 6: Create the admin API route**

```typescript
// apps/backend/src/api/admin/product-questions/route.ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { PRODUCT_QUESTIONS_MODULE } from "../../../modules/product-questions";
import type ProductQuestionsService from "../../../modules/product-questions/service";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { product_id, unanswered } = req.query as {
    product_id?: string;
    unanswered?: string;
  };
  const svc = req.scope.resolve<ProductQuestionsService>(PRODUCT_QUESTIONS_MODULE);
  const filter: Record<string, unknown> = {};
  if (product_id) filter.product_id = product_id;
  if (unanswered === "true") filter.answer = null;
  const questions = await svc.listProductQuestions(filter, {
    order: { created_at: "DESC" },
    take: 100,
  });
  res.json({ questions });
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id, answer, is_public } = req.body as {
    id: string;
    answer: string;
    is_public?: boolean;
  };
  if (!id || !answer?.trim()) {
    return res.status(400).json({ message: "id and answer are required" });
  }
  const svc = req.scope.resolve<ProductQuestionsService>(PRODUCT_QUESTIONS_MODULE);
  const updated = await svc.updateProductQuestions(id, {
    answer: answer.trim(),
    is_public: is_public ?? true,
    answered_at: new Date(),
    updated_at: new Date(),
  });
  res.json({ question: updated });
}
```

- [ ] **Step 7: Commit backend**

```bash
git add apps/backend/src/modules/product-questions apps/backend/src/api/store/products apps/backend/src/api/admin/product-questions apps/backend/medusa-config.ts
git commit -m "feat(backend): product-questions module with store submit + admin reply endpoints"
```

---

## Task 10: Questions form + tab on PDP (frontend)

**Files:**
- Create: `apps/storefront/src/components/product/questions-form.tsx`
- Modify: `apps/storefront/src/app/p/[slug]/page.tsx`

- [ ] **Step 1: Create the QuestionsForm component**

```typescript
// apps/storefront/src/components/product/questions-form.tsx
"use client";

import * as React from "react";
import { Button, Input } from "@risitex/ui/components";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { MessageCircle, CheckCircle } from "lucide-react";

type Question = {
  id: string;
  customer_name: string;
  question: string;
  answer: string | null;
  created_at: string;
};

async function fetchQuestions(productId: string): Promise<Question[]> {
  const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";
  try {
    const res = await fetch(
      `${MEDUSA_BASE_URL}/store/products/${productId}/questions`,
      { headers: { "x-publishable-api-key": PUB_KEY }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { questions?: Question[] };
    return body.questions ?? [];
  } catch {
    return [];
  }
}

async function submitQuestion(
  productId: string,
  data: { customer_name: string; customer_email: string; question: string }
): Promise<{ ok: boolean }> {
  const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";
  const res = await fetch(
    `${MEDUSA_BASE_URL}/store/products/${productId}/questions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-publishable-api-key": PUB_KEY,
      },
      body: JSON.stringify(data),
    }
  );
  return { ok: res.ok };
}

export function QuestionsTab({ productId }: { productId: string }) {
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [text, setText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchQuestions(productId).then((q) => {
      setQuestions(q);
      setLoaded(true);
    });
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !text.trim()) {
      setErr("Please fill in all fields.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    const { ok } = await submitQuestion(productId, {
      customer_name: name.trim(),
      customer_email: email.trim(),
      question: text.trim(),
    });
    setSubmitting(false);
    if (ok) {
      setSubmitted(true);
      setName("");
      setEmail("");
      setText("");
    } else {
      setErr("Couldn't send your question. Try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Existing public Q&As */}
      {loaded && questions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-body-md font-medium text-text-primary">
            Answered questions
          </h3>
          {questions.map((q) => (
            <div key={q.id} className="rounded-lg bg-surface-sunken p-4">
              <p className="flex items-start gap-2 text-body-sm text-text-primary">
                <MessageCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-muted" />
                <span>
                  <span className="font-medium">{q.customer_name}:</span>{" "}
                  {q.question}
                </span>
              </p>
              {q.answer && (
                <p className="mt-2 pl-6 text-body-sm text-text-secondary">
                  <span className="font-medium text-text-primary">Answer:</span>{" "}
                  {q.answer}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Submit form */}
      <div>
        <h3 className="mb-4 text-body-md font-medium text-text-primary">
          Ask a question
        </h3>
        {submitted ? (
          <div className="flex items-center gap-2 rounded-lg bg-feedback-success-bg px-4 py-3 text-body-sm text-feedback-success-text ring-1 ring-feedback-success-border">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            Question submitted. We'll reply to your email shortly.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
              />
              <Input
                type="email"
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
              />
            </div>
            <textarea
              placeholder="Your question…"
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              rows={3}
              required
              className="w-full resize-none rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-body-md text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none"
            />
            {err && (
              <p className="text-body-sm text-feedback-error-text">{err}</p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Submit question"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Questions accordion to PDP**

In `apps/storefront/src/app/p/[slug]/page.tsx`, add the import at the top:

```typescript
import { QuestionsTab } from "@/components/product/questions-form";
```

Then in the info column's `<Accordion>` section, add a new item after "wholesale":

```tsx
<AccordionItem value="questions">
  <AccordionTrigger>Questions &amp; answers</AccordionTrigger>
  <AccordionContent>
    <QuestionsTab productId={product.slug} />
  </AccordionContent>
</AccordionItem>
```

Note: We use `product.slug` as the productId because the store API will look up by handle/slug, not Medusa's internal UUID.

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/components/product/questions-form.tsx apps/storefront/src/app/p/[slug]/page.tsx
git commit -m "feat(pdp): Questions & Answers tab with submit form + backend persistence"
```

---

## Task 11: Remove Women section from frontend

**Files:**
- Modify: `apps/storefront/src/components/site/topnav.tsx`
- Modify: `apps/storefront/src/components/site/mobile-menu.tsx`
- Modify: `apps/storefront/src/app/page.tsx`

- [ ] **Step 1: Remove Women megamenu from topnav**

In `apps/storefront/src/components/site/topnav.tsx`:

Delete the entire `WOMEN_SECTIONS` constant (lines 36–49).

Remove the Women `<li>` block (the second `<li>` inside the desktop nav `<ul>`):
```tsx
// DELETE these 10 lines:
<li>
  <Megamenu
    label="Women"
    href="/shop/women"
    imageTone="#E4D8C8"
    imageEyebrow="Editor's pick"
    imageTitle="The cropped jacket"
    imageCtaHref="/p/cropped-jacket"
    imageCtaLabel="Made to order"
    sections={WOMEN_SECTIONS}
  />
</li>
```

- [ ] **Step 2: Remove Women from mobile menu**

In `apps/storefront/src/components/site/mobile-menu.tsx`, delete the Women entry from the `NAV` array:
```typescript
// DELETE this block:
{
  label: "Women",
  href: "/shop/women",
  children: [
    { href: "/shop/women", label: "All women" },
    { href: "/shop/women?cat=outerwear", label: "Outerwear" },
    { href: "/shop/women?cat=accessories", label: "Accessories" },
  ],
},
```

- [ ] **Step 3: Remove Women from homepage category strip**

In `apps/storefront/src/app/page.tsx`, change `CATEGORIES`:
```typescript
// BEFORE
const CATEGORIES = [
  { href: "/shop/men", label: "Men", tone: "#F1ECDF" },
  { href: "/shop/women", label: "Women", tone: "#E4D8C8" },
  { href: "/shop/fabric", label: "Fabric", tone: "#D9E0E6" },
  { href: "/wholesale/catalogue", label: "Wholesale", tone: "#DEE3F0" },
];

// AFTER
const CATEGORIES = [
  { href: "/shop/men", label: "Men", tone: "#F1ECDF" },
  { href: "/shop/fabric", label: "Fabric", tone: "#D9E0E6" },
  { href: "/shop/innerwear", label: "Innerwear", tone: "#EDE8E0" },
  { href: "/wholesale/catalogue", label: "Wholesale", tone: "#DEE3F0" },
];
```

Also update the hero heading to replace the grid from "Four ways in." to "Three ways in." since we now have 3 categories + wholesale:
```tsx
// In the category strip:
<h2 className="mt-2 text-heading-xl text-text-primary">
  Three ways in.
</h2>
```

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/components/site/topnav.tsx apps/storefront/src/components/site/mobile-menu.tsx apps/storefront/src/app/page.tsx
git commit -m "feat(nav): remove Women section from topnav, mobile menu, and homepage"
```

---

## Task 12: Navbar & homepage UI polish

**Files:**
- Modify: `apps/storefront/src/components/site/topnav.tsx`
- Modify: `apps/storefront/src/app/page.tsx`

- [ ] **Step 1: Tighten the topnav — reduce desktop nav gap from gap-6 to gap-4**

In `topnav.tsx`, find:
```tsx
<ul className="hidden items-center gap-6 lg:flex">
```
Change to:
```tsx
<ul className="hidden items-center gap-4 lg:flex">
```

- [ ] **Step 2: Make the logo link text slightly bolder on hover**

In `topnav.tsx`:
```tsx
// BEFORE
<Link href="/" className="rounded-sm focus-visible:ring-focus" aria-label="RISITEX home">

// AFTER
<Link href="/" className="rounded-sm transition-opacity duration-fast hover:opacity-80 focus-visible:ring-focus" aria-label="RISITEX home">
```

- [ ] **Step 3: Homepage hero — update CTA to use PIX branding**

In `apps/storefront/src/app/page.tsx`, update the hero eyebrow and heading:

```tsx
// BEFORE
<p className="rx-rise flex items-center gap-3 text-micro uppercase tracking-[0.18em] text-text-muted" style={{ animationDelay: "0ms" }}>
  <span aria-hidden className="h-px w-8 bg-text-muted/50" />
  New for 2026
</p>
<h1 className="rx-rise mt-4 text-display-xl text-text-primary" style={{ animationDelay: "90ms" }}>
  The cloth,
  <br />
  <span className="font-display italic">laid flat.</span>
</h1>
<p className="rx-rise mt-6 max-w-prose text-body-lg text-text-secondary" style={{ animationDelay: "170ms" }}>
  Premium textiles for retail buyers and wholesale partners.
  Woven in Tamil Nadu, finished by hand, shipped from one
  catalogue — whether you need a single shirt or six master
  cartons.
</p>

// AFTER
<p className="rx-rise flex items-center gap-3 text-micro uppercase tracking-[0.18em] text-text-muted" style={{ animationDelay: "0ms" }}>
  <span aria-hidden className="h-px w-8 bg-text-muted/50" />
  PIX Innerwear · Erode
</p>
<h1 className="rx-rise mt-4 text-display-xl text-text-primary" style={{ animationDelay: "90ms" }}>
  Engineered for hygiene.
  <br />
  <span className="font-display italic">Crafted for comfort.</span>
</h1>
<p className="rx-rise mt-6 max-w-prose text-body-lg text-text-secondary" style={{ animationDelay: "170ms" }}>
  Premium innerwear and loungewear for retail buyers and wholesale
  partners. Boxer shorts, lounge shorts, pyjamas — crafted in Erode
  and shipped in master cartons.
</p>
```

Also update the hero placeholder card text:
```tsx
// BEFORE
<span className="font-display text-[64px] leading-none text-text-primary/80">PIX</span>
<span className="text-micro uppercase tracking-[0.3em] text-text-muted">Erode · Tamil Nadu</span>

// AFTER (same — already on brand)
<span className="font-display text-[64px] leading-none text-text-primary/80">PIX</span>
<span className="text-micro uppercase tracking-[0.3em] text-text-muted">Engineered · Erode</span>
```

- [ ] **Step 4: Update wholesale pitch to use PIX-specific bullets**

```tsx
// BEFORE
<ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-body-md text-text-secondary">
  <li>· MOQ from 240 pcs</li>
  <li>· Up to 5 tier brackets</li>
  <li>· Lead times in days</li>
  <li>· GST-compliant invoicing</li>
</ul>

// AFTER
<ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-body-md text-text-secondary">
  <li>· MOQ from 60 pcs</li>
  <li>· Master carton pricing</li>
  <li>· 5 size tiers (S–XXL)</li>
  <li>· GST-compliant invoicing</li>
</ul>
```

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/components/site/topnav.tsx apps/storefront/src/app/page.tsx
git commit -m "feat(ui): tighten navbar spacing; update homepage hero copy to PIX brand messaging"
```

---

## Task 13: Remove demo data / unused backend seeder artefacts

**Files:**
- Review: `apps/backend/src/scripts/seed-checkout.ts`

- [ ] **Step 1: Inspect the seed-checkout script**

Read `apps/backend/src/scripts/seed-checkout.ts`. If it creates demo orders, products or customers purely for demonstration:
- Delete it: `rm apps/backend/src/scripts/seed-checkout.ts`
- If it's needed for integration testing, keep it but add a `// TEST ONLY` comment header

Check for gamification or platform_fee references:
```bash
grep -r "gamification\|platform_fee\|demo_data" apps/backend/src --include="*.ts" -l
```

If any files are returned, open each and remove those features or their configuration.

- [ ] **Step 2: Commit if changes were made**

```bash
git add -A
git commit -m "chore(backend): remove unused demo/gamification/platform-fee artefacts"
```

---

## Task 14: Run both apps

- [ ] **Step 1: Ensure Docker services are up**

```bash
pnpm docker:up
```

Wait ~10 seconds for PostgreSQL and Redis to be ready.

- [ ] **Step 2: Run migrations for the new product-questions module**

```bash
cd apps/backend && npx medusa db:migrate && cd ../..
```

Expected: "Migrations completed successfully" (or similar). If this fails with a missing table error, run:
```bash
cd apps/backend && npx medusa db:sync && cd ../..
```

- [ ] **Step 3: Start both apps in parallel**

```bash
pnpm dev
```

This runs Turborepo's dev script across both `apps/backend` and `apps/storefront` concurrently.

Expected output:
- Backend: `Server is ready on port 9000`
- Storefront: `ready started server on 0.0.0.0:3000`

- [ ] **Step 4: Smoke test in browser**

Open http://localhost:3000 and verify:
1. Hero says "Engineered for hygiene. Crafted for comfort."
2. Navbar shows Men, Fabric, Innerwear, Wholesale, Journal — no Women
3. Cmd+K opens search — clicking a product navigates to it
4. Any PDP → scroll to accordion → "Questions & answers" tab is present
5. Any PDP → fill matrix + click "Add to quote" → cart drawer opens with the item
6. Any PDP → click "Save for later" → navigate to /saved → item appears
7. B2B sidebar shows "Bulk orders" below "Quick reorder"
8. B2B Quick reorder shows order cards with "Reorder all" buttons

---

## Self-review

| Requirement | Task |
|---|---|
| Save to cart button on each product page | Tasks 3–5 |
| Saved to cart page | Task 6 |
| Bulk orders page below quick reorder | Task 8 |
| Bulk order to cart button fix (key separator + medusaVariantId) | Task 2 |
| Quick reorder shows actual orders | Task 7 |
| Search bar results are clickable | Task 1 |
| Questions tab on PDP (backend + frontend) | Tasks 9–10 |
| Remove Women section | Task 11 |
| Navbar + homepage UI | Task 12 |
| Remove demo data / unused backend artefacts | Task 13 |
| Run both apps | Task 14 |
