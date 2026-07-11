# Wholesale PDP + MOQ/Pack Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MOQ a single per-product constraint counted in individual pieces, let admins mark variants as multi-piece packs, and apply the requested PDP / catalogue / checkout UI changes.

**Architecture:** Pack-awareness is added at the storefront data layer (`packSize` on each variant, sourced from Medusa variant metadata). A new pure lib module holds the piece-counting math (unit-tested with vitest). The PDP buy panel and the shared MatrixOrderGrid are reworked to use +/- steppers and count pieces. The size chart, catalogue filters, and checkout delivery are edited in place.

**Tech Stack:** Next.js 15 (App Router), React 18, TypeScript, Tailwind, vitest, Medusa v2, `@risitex/ui` component package.

**Repo root for all paths:** `apps/…` / `packages/…` are relative to the git root `risitex-main/`. Work on branch `feat/wholesale-pdp-moq-pack`.

**Testing note:** The storefront has vitest wired for pure lib modules only (`apps/storefront/src/lib/__tests__/*.test.ts`); there is no React component test harness. So: pure logic → TDD with vitest. UI/component changes → verified by `pnpm --filter @risitex/storefront typecheck` plus manual visual check (documented per task). Do not scaffold a new component-test framework.

---

## Task 1: Add `packSize` to the storefront Variant model + loader mapping

**Files:**
- Modify: `apps/storefront/src/data/products.ts` (Variant type, ~line 8-25)
- Modify: `apps/storefront/src/lib/wholesale-products.ts` (query fields ~line 39; variant matrix build ~line 236-255; `LiveVariant` type)

- [ ] **Step 1: Add `packSize` to the fixture Variant type**

In `apps/storefront/src/data/products.ts`, find the variant type (the object with `sku`, `size`, `colour`, `inventoryState`, `stockCount`). Add:

```ts
  /** How many individual pieces this variant contains when sold as a pack.
   *  1 (or absent) = a single piece. e.g. a "30-36" pack of 4 → 4. */
  packSize?: number;
```

- [ ] **Step 2: Ensure variant metadata is fetched from Medusa**

In `apps/storefront/src/lib/wholesale-products.ts`, locate the query `fields` array (contains `"*variants"`, `"*variants.options"`, `"*variants.calculated_price"` around line 39). Add the variant metadata field:

```ts
  "*variants.metadata",
```

- [ ] **Step 3: Add `metadata` to the `LiveVariant` type**

In the same file, find the `LiveVariant` type (has `id`, `sku`, options, `calculated_price`). Add:

```ts
  metadata?: Record<string, unknown> | null;
```

- [ ] **Step 4: Map `pack_size` into the built variant**

In the variant matrix build loop (around line 239-255, `for (const v of variants)` that pushes `{ id, sku, size, colour, ... }`), read the pack size and include it. Add a small helper near the other coercers (`num`, `str`) if not present, then in the pushed object add `packSize`:

```ts
const packSize = num((v.metadata ?? {}).pack_size);
```
and in the pushed variant object:
```ts
  ...(packSize && packSize > 1 ? { packSize } : {}),
```

(Use the existing `num()` coercer already used for `meta.moq`. If `num` is not in scope for variants, inline `const n = Number((v.metadata as any)?.pack_size); const packSize = Number.isFinite(n) ? n : undefined;`.)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @risitex/storefront typecheck`
Expected: PASS (no type errors).

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/data/products.ts apps/storefront/src/lib/wholesale-products.ts
git commit -m "feat(wholesale): source per-variant packSize from Medusa variant metadata"
```

---

## Task 2: Pure MOQ/pack math module (TDD)

Centralises piece-counting so the buy panel, cart, and any validation share one implementation.

**Files:**
- Create: `apps/storefront/src/lib/moq-pack.ts`
- Test: `apps/storefront/src/lib/__tests__/moq-pack.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/storefront/src/lib/__tests__/moq-pack.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  packSizeOf,
  cellPieces,
  maxPacksForStock,
  meetsMoq,
} from "../moq-pack";

describe("moq-pack", () => {
  it("packSizeOf defaults to 1", () => {
    expect(packSizeOf(undefined)).toBe(1);
    expect(packSizeOf(0)).toBe(1);
    expect(packSizeOf(-3)).toBe(1);
    expect(packSizeOf(4)).toBe(4);
  });

  it("cellPieces multiplies pack count by pack size", () => {
    expect(cellPieces(1, 4)).toBe(4);
    expect(cellPieces(3, 1)).toBe(3);
    expect(cellPieces(0, 4)).toBe(0);
  });

  it("maxPacksForStock floors available pieces by pack size", () => {
    expect(maxPacksForStock(10, 4)).toBe(2);
    expect(maxPacksForStock(8, 4)).toBe(2);
    expect(maxPacksForStock(null, 4)).toBe(Infinity);
    expect(maxPacksForStock(3, 1)).toBe(3);
  });

  it("meetsMoq compares total pieces to moq", () => {
    // one pack of 4 satisfies MOQ 4
    expect(meetsMoq(4, 4)).toBe(true);
    expect(meetsMoq(3, 4)).toBe(false);
    expect(meetsMoq(0, 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @risitex/storefront exec vitest run src/lib/__tests__/moq-pack.test.ts`
Expected: FAIL ("Cannot find module '../moq-pack'").

- [ ] **Step 3: Write the implementation**

Create `apps/storefront/src/lib/moq-pack.ts`:

```ts
/**
 * Pack-aware MOQ math for wholesale ordering.
 *
 * MOQ is a single per-product number measured in INDIVIDUAL PIECES.
 * A variant may be sold as a pack (e.g. a "30-36" pack of 4). The buyer
 * keys a PACK count into each grid cell; the pieces that count toward MOQ
 * (and toward pricing) are `packCount * packSize`.
 */

/** Normalise a raw packSize to a positive integer, defaulting to 1. */
export function packSizeOf(raw: number | undefined | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

/** Pieces represented by `packCount` packs of `packSize` each. */
export function cellPieces(packCount: number, packSize: number): number {
  return Math.max(0, packCount) * packSizeOf(packSize);
}

/** Max whole packs that fit in `availablePieces` stock. null stock = no cap. */
export function maxPacksForStock(
  availablePieces: number | null | undefined,
  packSize: number,
): number {
  if (availablePieces === null || availablePieces === undefined) return Infinity;
  return Math.floor(Math.max(0, availablePieces) / packSizeOf(packSize));
}

/** Whether total pieces satisfies the product MOQ. */
export function meetsMoq(totalPieces: number, moq: number): boolean {
  return totalPieces >= (moq ?? 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @risitex/storefront exec vitest run src/lib/__tests__/moq-pack.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/lib/moq-pack.ts apps/storefront/src/lib/__tests__/moq-pack.test.ts
git commit -m "feat(wholesale): add pack-aware MOQ math lib with tests"
```

---

## Task 3: Convert MatrixOrderGrid cells to +/- steppers with pack hints

**Files:**
- Modify: `packages/ui/src/components/matrix-order-grid.tsx`

- [ ] **Step 1: Extend `MatrixCell` with pack + max metadata**

In `packages/ui/src/components/matrix-order-grid.tsx`, add to the `MatrixCell` type:

```ts
  /** Pieces per pack for this cell's variant (1 = single piece). */
  packSize?: number;
  /** Max PACKS selectable for this cell (stock ÷ packSize). */
  maxPacks?: number;
```

- [ ] **Step 2: Replace the `<input type="number">` cell body with a stepper**

Inside the cell render (the `disabled ? … : <input …/>` block, ~line 153-178), replace the `<input>` branch with a −/value/+ stepper. The value is the PACK count; clamp to `cell.maxPacks`:

```tsx
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          aria-label="Decrease"
                          className="flex h-7 w-7 items-center justify-center rounded-sm border border-border-subtle text-text-primary disabled:opacity-40"
                          disabled={value <= 0}
                          onClick={() =>
                            onQuantityChange(row.id, col.id, Math.max(0, value - 1))
                          }
                        >
                          −
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={cell?.maxPacks ?? 99999}
                          value={value || ""}
                          onChange={(e) => {
                            const n = Number(e.currentTarget.value);
                            const clamped = Number.isNaN(n)
                              ? 0
                              : Math.min(
                                  Math.max(0, n),
                                  cell?.maxPacks ?? Number.MAX_SAFE_INTEGER,
                                );
                            onQuantityChange(row.id, col.id, clamped);
                          }}
                          placeholder="0"
                          className={cn(
                            "h-7 w-10 rounded-sm bg-transparent text-center text-body-md text-text-primary outline-none",
                            "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                            value > 0 && "text-brand-accent",
                          )}
                        />
                        <button
                          type="button"
                          aria-label="Increase"
                          className="flex h-7 w-7 items-center justify-center rounded-sm border border-border-subtle text-text-primary disabled:opacity-40"
                          disabled={value >= (cell?.maxPacks ?? Infinity)}
                          onClick={() =>
                            onQuantityChange(
                              row.id,
                              col.id,
                              Math.min(value + 1, cell?.maxPacks ?? Number.MAX_SAFE_INTEGER),
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                      {cell?.packSize && cell.packSize > 1 ? (
                        <div className="mt-0.5 text-[10px] leading-none text-text-muted">
                          ×{cell.packSize} pcs/pack
                        </div>
                      ) : null}
```

Keep the existing `disabled` branch (`<span>—</span>`) unchanged. Row/column totals continue to sum the pack-count `quantities` (they now read as pack counts; the buy panel renders the piece total separately — see Task 4).

- [ ] **Step 3: Typecheck the UI package**

Run: `pnpm --filter @risitex/ui typecheck`
Expected: PASS. (If `@risitex/ui` has no `typecheck` script, run `pnpm --filter @risitex/storefront typecheck` after Task 4 wires the props.)

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/matrix-order-grid.tsx
git commit -m "feat(ui): matrix grid cells use +/- steppers with pack-size hint"
```

---

## Task 4: Rework B2bBuyPanel — Bulk Order Grid, pack-aware pieces, remove tier/carton/margin

**Files:**
- Modify: `apps/storefront/src/components/product/b2b-buy-panel.tsx`

- [ ] **Step 1: Import the pack math and drop carton/tier machinery**

At the top of `b2b-buy-panel.tsx`, add:

```ts
import { packSizeOf, cellPieces, maxPacksForStock, meetsMoq as meetsMoqFn } from "@/lib/moq-pack";
```

Remove the `TierLadder`, `MarginCalculator` imports from `@risitex/ui/components` (leave `Button`, `MatrixOrderGrid`, `formatINR`, and the `Matrix*` types).

- [ ] **Step 2: Attach packSize + maxPacks to each cell**

In the `cells` useMemo (around line 106-135), when a `variant` is found, compute pack fields and include them on the pushed cell:

```ts
          const ps = packSizeOf(variant.packSize);
          const stock = avail ? avail.available ?? fixtureStock : fixtureStock;
          out.push({
            rowId: r.id,
            colId: c.id,
            variantId: variant.id,
            sku: variant.sku,
            stock,
            packSize: ps,
            maxPacks: maxPacksForStock(stock, ps),
          });
```

(Keep the existing `fixtureStock` computation just above.)

- [ ] **Step 3: Replace unit totals with piece totals; drop tier/carton**

Replace the block computing `totalQty`, `moq`, `meetsMoq`, `cartonSize`, `fullCartons`, `looseUnits`, `currentTier`, `lineTotalMajor` (around line 137-159) with:

```ts
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  // `quantities` holds PACK counts keyed by `${rowId}_${colId}`.
  // Total PIECES = Σ(packCount × packSize).
  const packSizeByKey = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const cell of cells) m[`${cell.rowId}_${cell.colId}`] = cell.packSize ?? 1;
    return m;
  }, [cells]);

  const totalPieces = React.useMemo(
    () =>
      Object.entries(quantities).reduce(
        (sum, [key, packs]) => sum + cellPieces(packs, packSizeByKey[key] ?? 1),
        0,
      ),
    [quantities, packSizeByKey],
  );

  const moq = product.moq ?? 0;
  const meetsMoq = meetsMoqFn(totalPieces, moq);
  const lineTotalMajor = product.priceMajor * totalPieces;
```

Delete the now-removed `const [quantities, setQuantities] = …` line that appeared later (line 137) — it is moved up here so there is exactly one declaration.

- [ ] **Step 4: Clamp handler to pack maxima**

Replace `handleQty` (around line 172-176) with a version clamping to `maxPacks`:

```ts
  const maxPacksByKey = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const cell of cells) m[`${cell.rowId}_${cell.colId}`] = cell.maxPacks ?? Infinity;
    return m;
  }, [cells]);

  const handleQty = (rowId: string, colId: string, packs: number) => {
    const key = `${rowId}_${colId}`;
    const capped = Math.min(Math.max(0, packs), maxPacksByKey[key] ?? Infinity);
    setQuantities((prev) => ({ ...prev, [key]: capped }));
  };
```

- [ ] **Step 5: Remove the "master carton" add button + handler**

Delete `canAddCarton`, `handleAddCarton`, and (in Step 8's JSX) the `{canAddCarton && (<Button …/>)}` block and the carton `Stat`.

- [ ] **Step 6: Build cart lines in PIECES**

In `handleAdd` (around line 226-269), change the per-cell quantity to pieces and carry packSize. Replace the `qty`/`newLines.push` portion so:

```ts
      const packs = quantities[`${cell.rowId}_${cell.colId}`] ?? 0;
      if (packs <= 0) continue;
      const ps = packSizeByKey[`${cell.rowId}_${cell.colId}`] ?? 1;
      const pieces = cellPieces(packs, ps);
```

and in the pushed `CartLine`, set `quantity: pieces`, add `packSize: ps`, and drop `cartonSize`. Update `addedUnits += pieces;` and `unitPriceMajor` uses `product.priceMajor` (no `currentTier`):

```ts
    const unitPriceMajor = product.priceMajor;
```

- [ ] **Step 7: Rename heading + remove tier/margin sections in JSX**

- Delete the entire `{product.tiers && product.tiers.length > 0 && (<section>…TierLadder…</section>)}` block (~line 300-314).
- Delete the `{currentTier && (<MarginCalculator …/>)}` block (~line 316-321).
- Change the heading text `"Build your order"` → `"Bulk Order Grid"` and update the helper caption to: `"Set pack quantities per size × colour. Totals show individual pieces."`

- [ ] **Step 8: Update the summary Stats to pieces**

In the `<dl>` summary (~line 355-378), keep two stats only:

```tsx
          <Stat label="Total pieces" value={totalPieces.toLocaleString()} />
          <Stat label="Subtotal" value={formatINR(lineTotalMajor)} hint="excl. GST" />
```

Delete the "Cartons" and "Tier" `Stat`s. Change the grid class from `md:grid-cols-4` to `md:grid-cols-2`.

- [ ] **Step 9: Update the CTA + MOQ caption to pieces**

In the Add-to-cart button label and the caption (~line 380-404), replace `totalQty`→`totalPieces` and the MOQ shortfall math:

```tsx
            {totalPieces === 0
              ? "Add quantities first"
              : meetsMoq
                ? `Add to cart · ${totalPieces.toLocaleString()} pcs`
                : `${(moq - totalPieces).toLocaleString()} pcs to MOQ`}
```
and the caption:
```tsx
          <span className="text-caption text-text-muted">
            MOQ {moq.toLocaleString()} pcs · Lead {product.leadTimeDays ?? "—"} days
          </span>
```
Change the disabled prop to `disabled={!meetsMoq || totalPieces === 0}`. Remove the "Bulk Enquiry" secondary `<Button>` next to Add-to-cart (per spec: no request-quote paths on PDP).

- [ ] **Step 10: Typecheck**

Run: `pnpm --filter @risitex/storefront typecheck`
Expected: PASS. Fix any remaining references to `totalQty`, `currentTier`, `cartonSize`, `fullCartons`, `looseUnits` (all removed).

- [ ] **Step 11: Commit**

```bash
git add apps/storefront/src/components/product/b2b-buy-panel.tsx
git commit -m "feat(pdp): pack-aware Bulk Order Grid; remove tier ladder, margin calc, carton add"
```

---

## Task 5: Add `packSize` to CartLine (display only)

**Files:**
- Modify: `apps/storefront/src/lib/cart.ts`

- [ ] **Step 1: Add the field**

In `apps/storefront/src/lib/cart.ts`, add to the `CartLine` type (after `cartonSize?`):

```ts
  /** Pieces per pack for this variant; display only. Line `quantity` is
   *  already stored in individual pieces. */
  packSize?: number;
```

`quantity` remains the piece count, so `subtotalMajor` and `totalUnits` stay correct with no other change.

- [ ] **Step 2: Typecheck + run existing lib tests**

Run: `pnpm --filter @risitex/storefront typecheck && pnpm --filter @risitex/storefront exec vitest run`
Expected: PASS (existing tests still green).

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/lib/cart.ts
git commit -m "feat(cart): carry packSize on cart lines for display"
```

---

## Task 6: PDP page — remove sample/quote, remove carton/tier panels, move description down

**Files:**
- Modify: `apps/storefront/src/app/wholesale/p/[slug]/page.tsx`

- [ ] **Step 1: Remove Request Sample / Request Quote block**

Delete the `<div className="mt-4 flex flex-wrap gap-3">…</div>` that renders `<SizeChartModal/>`, `RequestQuoteModal`, the signed-out "Request quote" link, and the "Request sample" link (~line 161-183). Re-add a standalone `<SizeChartModal … />` (with the prop from Task 7) just below the buy panel:

```tsx
            <div className="mt-4">
              <SizeChartModal garment={sizeChartGarment} />
            </div>
```

Remove the now-unused imports `RequestQuoteModal`. (Keep `SizeChartModal`.)

- [ ] **Step 2: Remove the description paragraph next to the title**

Delete the `<p className="mt-4 text-body-lg text-text-secondary">{product.description}</p>` (~line 132-134).

- [ ] **Step 3: Trim the Wholesale Controls panel (remove carton rows)**

In the first `<InfoPanel title="Wholesale Controls" items={[…]} />` (~line 188-200), reduce `items` to MOQ + minimum only:

```tsx
            items={[
              ["MOQ", `${product.moq ?? 0} pcs`],
              ["Minimum Order", `${product.moq ?? 0} pcs`],
            ]}
```

Delete the "Case Pack", "Master Carton", and "Recommended MOQ" rows.

- [ ] **Step 4: Remove the Size/Quantity matrix + Bulk Pricing tier section**

Delete the whole `<section className="grid grid-cols-1 gap-6 pb-16 lg:grid-cols-12">…</section>` that renders the "Size and Quantity Matrix" table and the "Bulk Pricing" `B2bPriceGate` tier list (~line 242-326). Remove the now-unused `B2bPriceGate` import **only if** it is not used elsewhere in the file (it is also used in `ProductCardRow` at the bottom — so keep the import).

- [ ] **Step 5: Add a "Product Description" section lower on the page**

Directly above the "Related products" section, insert:

```tsx
        <section className="pb-16">
          <h2 className="font-display text-heading-lg text-text-primary">
            Product Description
          </h2>
          <ul className="mt-6 list-disc space-y-2 pl-6 text-body-md text-text-secondary">
            {(product.descriptionBullets?.length
              ? product.descriptionBullets
              : product.description
                  .split(/[.\n]+/)
                  .map((s) => s.trim())
                  .filter(Boolean)
            ).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
```

If `product.descriptionBullets` does not exist on the `Product` type, this falls back to splitting `description` into sentence bullets — no type change required. (Optional: add `descriptionBullets?: string[]` to the `Product` type and map `metadata.description_bullets` in the loader; not required for this task.)

- [ ] **Step 6: Compute the size-chart garment key**

Near the top of `WholesalePdpPage`, after `product` is resolved, add:

```tsx
  const sizeChartGarment = garmentFromProduct(product);
```

and add this helper at the bottom of the file:

```tsx
function garmentFromProduct(p: { subcategory?: string; eyebrow?: string }): string | undefined {
  const hay = `${p.subcategory ?? ""} ${p.eyebrow ?? ""}`.toLowerCase();
  if (/boxer|brief|trunk|inner/.test(hay)) return "Innerwear";
  if (/vest/.test(hay)) return "Vest";
  if (/t-?shirt|tee/.test(hay)) return "T-Shirt";
  if (/jean|denim/.test(hay)) return "Jeans";
  if (/trouser|chino|pant/.test(hay)) return "Trouser";
  if (/shirt/.test(hay)) return "Shirt";
  return undefined;
}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @risitex/storefront typecheck`
Expected: PASS. Resolve unused-import warnings for `RequestQuoteModal`.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/app/wholesale/p/[slug]/page.tsx
git commit -m "feat(pdp): drop sample/quote/carton/tier UI; move description to bulleted section"
```

---

## Task 7: Size chart — garment prop, innerwear ranges, jeans (drop Rise, add Bottom)

**Files:**
- Modify: `apps/storefront/src/components/product/size-chart-modal.tsx`

- [ ] **Step 1: Support a `garment` prop that selects the initial tab**

Change the signature and initial state:

```tsx
export function SizeChartModal({ garment }: { garment?: string } = {}) {
  const [open, setOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<string>(
    garment && CHARTS[garment] ? garment : "Shirt",
  );
```

Add an effect so opening with a new garment re-selects the right tab:

```tsx
  React.useEffect(() => {
    if (garment && CHARTS[garment]) setActiveTab(garment);
  }, [garment]);
```

- [ ] **Step 2: Convert the innerwear chart to a range table (image 2)**

Replace `INNERWEAR_CHART` with range strings. The chart table renders numbers via `formatVal`; introduce a range-aware value. Simplest: store the display strings directly and special-case rendering. Replace `INNERWEAR_CHART` with:

```ts
const INNERWEAR_CHART: SizeChartData = {
  sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
  dimensions: [
    {
      name: "Waist (To Fit)",
      // Range low bounds in inches; the display shows the low–high band.
      sizes: { S: 28, M: 32, L: 36, XL: 40, "2XL": 44, "3XL": 48, "4XL": 52 },
    },
  ],
};

// Innerwear waist bands (low–high, inches) shown verbatim in the table.
const INNERWEAR_WAIST_RANGES: Record<string, [number, number]> = {
  S: [28, 30], M: [32, 34], L: [36, 38], XL: [40, 42],
  "2XL": [44, 46], "3XL": [48, 50], "4XL": [52, 54],
};
```

Then in the table body render, special-case innerwear waist so it prints the band. In the `<td>` that calls `formatVal(row.sizes[sz] ?? 0)`, wrap with:

```tsx
                              {activeTab === "Innerwear" && INNERWEAR_WAIST_RANGES[sz]
                                ? `${INNERWEAR_WAIST_RANGES[sz][0]}${unit === "cm" ? "" : '"'}–${
                                    unit === "cm"
                                      ? Math.round(INNERWEAR_WAIST_RANGES[sz][1] * 2.54 * 10) / 10 + " cm"
                                      : INNERWEAR_WAIST_RANGES[sz][1] + '"'
                                  }`
                                : formatVal(row.sizes[sz] ?? 0)}
```

(If the ternary in JSX is unwieldy, extract a `renderCell(row, sz)` function above the return that returns the band string for innerwear-waist and `formatVal(...)` otherwise. Prefer the extracted function.)

- [ ] **Step 3: Jeans — remove Rise, add Bottom**

Replace `JEANS_CHART`:

```ts
const JEANS_CHART: SizeChartData = {
  sizes: ["30", "32", "34", "36"],
  dimensions: [
    { name: "Waist", sizes: { "30": 30, "32": 32, "34": 34, "36": 36 } },
    { name: "Hip", sizes: { "30": 38, "32": 40, "34": 42, "36": 44 } },
    { name: "Inseam", sizes: { "30": 32, "32": 32, "34": 32, "36": 32 } },
    { name: "Bottom", sizes: { "30": 13, "32": 13.5, "34": 14, "36": 14.5 } },
  ],
};
```

Add a measuring-guide entry so the "How to Measure" grid covers Bottom (the guide is keyed by dimension name):

```ts
  Bottom: [
    "Measure the width across the bottom leg opening, then double it for the full circumference.",
  ],
```

(Add this key to `MEASURING_GUIDE`.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @risitex/storefront typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/components/product/size-chart-modal.tsx
git commit -m "feat(size-chart): garment auto-select; innerwear ranges; jeans drop Rise add Bottom"
```

---

## Task 8: Checkout delivery — Logistics Partner dropdown (transporters + None + Self pickup) with conditional optional fields

**Files:**
- Modify: `apps/storefront/src/app/b2b/checkout/page.tsx`

Read the current shipping/delivery step in `apps/storefront/src/app/b2b/checkout/page.tsx` before editing (state around line 327-370, provider list line 105-116, submit detail line 492-511, and the JSX rendering `DeliveryCompanySelector`). The goal: keep a single dropdown of the existing transporters plus `None` and `Self pickup`; when `None` is selected show 3 optional text inputs (Logistics ID / Transporter ID / Phone); when `Self pickup`, show nothing; a normal transporter shows nothing. Remove ETA/charge and the courier search box from the selector UI.

- [ ] **Step 1: Add None + Self pickup to the partner list**

At the `COURIER_PROVIDERS` array (line 105), append:

```ts
  { id: "self_pickup", name: "Self pickup", estimatedDelivery: "", chargeRupees: 0 },
  { id: "none", name: "None", estimatedDelivery: "", chargeRupees: 0 },
```

(If a `PICKUP_OPTIONS` array already carries self-pickup, you may reuse its id instead — inspect first; do not create a duplicate self-pickup concept. Prefer a single `self_pickup` id.)

- [ ] **Step 2: Add state for the 3 optional "None" fields**

Near the other shipping state (line 327-334), add:

```ts
  const [logisticsId, setLogisticsId] = React.useState<string>("");
  const [transporterId, setTransporterId] = React.useState<string>("");
  const [logisticsPhone, setLogisticsPhone] = React.useState<string>("");
```

- [ ] **Step 3: Render the conditional fields under the selector**

In the JSX where `<DeliveryCompanySelector … />` is rendered, immediately below it add:

```tsx
                {shippingMethodId === "none" && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      value={logisticsId}
                      onChange={(e) => setLogisticsId(e.currentTarget.value)}
                      placeholder="Logistics ID"
                      className="h-10 w-full rounded-md border border-border-subtle bg-surface-raised px-3 text-body-md text-text-primary"
                    />
                    <input
                      type="text"
                      value={transporterId}
                      onChange={(e) => setTransporterId(e.currentTarget.value)}
                      placeholder="Transporter ID"
                      className="h-10 w-full rounded-md border border-border-subtle bg-surface-raised px-3 text-body-md text-text-primary"
                    />
                    <input
                      type="tel"
                      value={logisticsPhone}
                      onChange={(e) => setLogisticsPhone(e.currentTarget.value)}
                      placeholder="Phone"
                      className="h-10 w-full rounded-md border border-border-subtle bg-surface-raised px-3 text-body-md text-text-primary"
                    />
                  </div>
                )}
```

- [ ] **Step 4: Loosen step validation + zero the charge for None/Self pickup**

- `canStep3` / the shipping-complete flag (line 428-429) currently requires `otherCourierName` for `other_courier`. Change it so `none` and `self_pickup` are always valid (no required fields):

```ts
  const shippingComplete =
    !!shippingMethodId &&
    (shippingMethodId !== "other_courier" || !!otherCourierName.trim());
```
Leave `other_courier` handling as-is; `none`/`self_pickup` fall through as valid because their ids are truthy and are not `other_courier`.
- `shippingPaise` (line 370) already resolves to 0 when the option's `chargeRupees` is 0, so None/Self pickup contribute no charge — no change needed once Step 1 gives them `chargeRupees: 0`.

- [ ] **Step 5: Pass the optional fields into the submitted order detail**

In the order-detail assembly (around line 492-511, where `courierDetail`/`courierNoteDetail` are built), append the None fields when present:

```ts
      const logisticsDetail =
        shippingMethodId === "none"
          ? [
              logisticsId.trim() && `Logistics ID: ${logisticsId.trim()}`,
              transporterId.trim() && `Transporter ID: ${transporterId.trim()}`,
              logisticsPhone.trim() && `Logistics Phone: ${logisticsPhone.trim()}`,
            ]
              .filter(Boolean)
              .join(" · ")
          : "";
```

Add `logisticsDetail` into the details array that already includes `courierDetail` (only include it if non-empty, matching the existing pattern for `courierNoteDetail`).

- [ ] **Step 6: Simplify the selector UI (remove ETA/charge + search)**

In `apps/storefront/src/components/checkout/delivery-company-selector.tsx`, remove the ETA/charge sub-text and the search input:
- In the trigger button, drop the `selected.estimatedDelivery` span (line 99-101).
- In each option row, drop the `option.estimatedDelivery` caption (line 187-189).
- Remove the search `<input>` block (line 125-136) and the `search`/`filtered` state, rendering `options` directly.

(If you prefer to keep the shared selector untouched for other callers, instead pass a `variant="plain"` prop — but there is only one caller, so editing in place is simplest.)

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @risitex/storefront typecheck`
Expected: PASS.

- [ ] **Step 8: Manual verification**

Run: `pnpm --filter @risitex/storefront dev`, open the b2b checkout, reach the Shipping step. Confirm: dropdown lists transporters + Self pickup + None; choosing None reveals 3 empty fields (no "optional" label); choosing Self pickup or a transporter shows none; order total shows no shipping charge for None/Self pickup; the order can be placed.

- [ ] **Step 9: Commit**

```bash
git add apps/storefront/src/app/b2b/checkout/page.tsx apps/storefront/src/components/checkout/delivery-company-selector.tsx
git commit -m "feat(checkout): logistics partner dropdown with None + Self pickup and optional ids"
```

---

## Task 9: Catalogue — search bar + horizontal filter dropdowns

**Files:**
- Modify: `apps/storefront/src/app/wholesale/catalogue/page.tsx`

Read the current filter sidebar (`FacetBlock`, `applyFilters`, the `Search` type ~line 25, facet computation ~line 160-188, sidebar JSX ~line 238+) before editing. This is a presentation refactor: the same `applyFilters`/facets, re-laid-out as a top row of dropdown chips, plus a new `q` search param.

- [ ] **Step 1: Add `q` to the Search param type + apply it**

In the `Search` type (line 25), add `q?: string`. In `applyFilters` (line 56+), add a first filter that matches the query across name/sku/eyebrow/description:

```ts
  if (s.q && s.q.trim()) {
    const q = s.q.trim().toLowerCase();
    out = out.filter((p) => {
      const hay = [
        p.name,
        p.eyebrow,
        p.description,
        ...p.variants.map((v) => v.sku),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
```

- [ ] **Step 2: Add an Availability facet**

The spec's filter set is Availability, Size, Price, Color, Material. Add availability filtering in `applyFilters`:

```ts
  if (s.availability === "in_stock") {
    out = out.filter((p) =>
      p.variants.some((v) => v.inventoryState !== "out_of_stock"),
    );
  }
```

Add `availability?: string` to the `Search` type.

- [ ] **Step 3: Render a search input bound to `q`**

This page is a server component driven by URL params. Add a small client search box component at the top of the catalogue that pushes `?q=` on submit. Create it inline in a new file `apps/storefront/src/components/catalogue/catalogue-search.tsx`:

```tsx
"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

export function CatalogueSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = React.useState(params.get("q") ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    router.push(`/wholesale/catalogue?${next.toString()}`);
  };

  return (
    <form onSubmit={submit} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        placeholder="Search all products"
        aria-label="Search all products"
        className="h-10 w-full rounded-md border border-border-subtle bg-surface-raised pl-9 pr-3 text-body-md text-text-primary"
      />
    </form>
  );
}
```

Render `<CatalogueSearch />` above the product grid in the catalogue page (import it).

- [ ] **Step 4: Convert the sidebar facets to a horizontal dropdown row**

Create `apps/storefront/src/components/catalogue/filter-dropdown.tsx` — a client `<details>`-based dropdown chip:

```tsx
"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";

export function FilterDropdown({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-3 text-body-sm text-text-primary">
        {label}
        <ChevronDown className="h-4 w-4 text-text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 top-full z-popover mt-1 min-w-[220px] rounded-lg border border-border-subtle bg-surface-raised p-3 shadow-popover">
        {children}
      </div>
    </details>
  );
}
```

In the catalogue page, replace the `<aside aria-label="Product filters">…</aside>` sidebar with a horizontal `<div className="flex flex-wrap items-center gap-2">` containing one `<FilterDropdown label="Availability|Size|Price|Color|Material">` per facet. Move the existing facet option markup (the colour swatches, size chips, price options — currently inside `FacetBlock`) into the corresponding `FilterDropdown`. Keep the existing `withParam` link-based option toggling so no client filter state is needed. Adjust the page grid from a `sidebar + grid` two-column layout to a single column with the filter row on top.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @risitex/storefront typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run the storefront dev server, open `/wholesale/catalogue`. Confirm: a search bar filters the list across all products; Availability/Size/Price/Color/Material render as clickable dropdown chips that open on click and filter the grid; results match the previous sidebar behaviour.

- [ ] **Step 7: Commit**

```bash
git add apps/storefront/src/app/wholesale/catalogue/page.tsx apps/storefront/src/components/catalogue/catalogue-search.tsx apps/storefront/src/components/catalogue/filter-dropdown.tsx
git commit -m "feat(catalogue): product search bar + horizontal filter dropdowns"
```

---

## Task 10: Final verification sweep

- [ ] **Step 1: Full typecheck + tests**

Run: `pnpm --filter @risitex/storefront typecheck && pnpm --filter @risitex/storefront exec vitest run && pnpm --filter @risitex/ui typecheck`
Expected: all PASS.

- [ ] **Step 2: Lint the touched packages**

Run: `pnpm --filter @risitex/storefront lint`
Expected: no new errors in touched files.

- [ ] **Step 3: Manual smoke of the PDP**

Run the storefront dev server; open a wholesale PDP as an approved B2B user. Confirm: heading reads "Bulk Order Grid"; cells have +/- steppers; a pack-of-N variant shows "×N pcs/pack" and one click adds N pieces toward MOQ; no Request Sample/Quote, no tier ladder, no carton stats; "Product Description" renders as bullets lower on the page; the Size Chart opens on the correct garment tab (jeans has no Rise + a Bottom row; innerwear shows the 7 size bands).

- [ ] **Step 4: Document any admin step**

Confirm in `README.md` or the b2b docs that admins set a variant pack by adding `pack_size` (integer) to the variant's metadata in Medusa Admin. Add a one-line note if none exists.

- [ ] **Step 5: Final commit (if docs touched)**

```bash
git add -A
git commit -m "docs: note pack_size variant metadata for wholesale packs"
```

---

## Self-Review (author checklist — completed)

- **Spec coverage:** §1 MOQ/pack → Tasks 1,2,3,4,5; §2 Bulk Order Grid → Tasks 3,4; §3 removals → Tasks 4,6; §4 description down → Task 6; §5 size chart → Tasks 6(prop wiring),7; §6 delivery → Task 8; §7 catalogue search+filters → Task 9. All covered.
- **Placeholder scan:** No TBD/TODO; each code step shows concrete code.
- **Type consistency:** `packSize` used consistently (Variant, MatrixCell, CartLine); `packSizeOf`/`cellPieces`/`maxPacksForStock`/`meetsMoq` names match between lib and consumers; `quantities` are pack counts throughout, pieces derived via `cellPieces`.
