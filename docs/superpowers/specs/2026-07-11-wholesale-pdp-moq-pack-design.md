# RISITEX Wholesale PDP + MOQ/Pack Overhaul — Design

**Date:** 2026-07-11
**Status:** Approved for planning

## Goal

Rework the wholesale product experience: make MOQ a single per-product
constraint counted in individual pieces, let admins mark variants as multi-piece
packs, and apply a set of PDP/catalogue/checkout UI changes to match the
requested designs (DAMENSCH-style reference screenshots).

## Surfaces

- **PDP** — `apps/storefront/src/app/wholesale/p/[slug]/page.tsx` and
  `apps/storefront/src/components/product/b2b-buy-panel.tsx`
- **Catalogue (list)** — `apps/storefront/src/app/wholesale/catalogue/page.tsx`
- **Checkout delivery** — `apps/storefront/src/app/b2b/checkout/page.tsx` and
  `apps/storefront/src/components/checkout/delivery-company-selector.tsx`
- **Size chart** — `apps/storefront/src/components/product/size-chart-modal.tsx`
- **Backend product data** — variant metadata (native Medusa Admin);
  loader `apps/storefront/src/lib/wholesale-products.ts`; fixture types
  `apps/storefront/src/data/products.ts`

---

## 1. MOQ per whole product + per-variant pack size (core)

### Requirement
MOQ applies to the **whole product**, not per variant, and is measured in
**individual pieces**. A variant may be sold as a **pack** (e.g. size "30-36" is
one variant containing 4 pieces). Selecting quantity `1` of a pack-of-4 variant
must contribute **4 pieces** toward the MOQ. Admin declares whether a variant is
a pack of 4 / 3 / … or a single piece.

### Backend / admin
- Admin sets `pack_size` on each **product variant** via native Medusa Admin
  variant **metadata** (key `pack_size`, integer). Absent/blank/`1` = single
  piece. No new admin UI.
- MOQ is unchanged in source: the single per-product value already read from the
  b2b quantity-rule `min_qty` or product `metadata.moq` (default 50). It is
  interpreted as **individual pieces**.

### Storefront data model
- Add `packSize?: number` to the `Variant` type in `data/products.ts`
  (default treated as 1 when absent).
- In `wholesale-products.ts` variant mapping (`buildProduct` / matrix build),
  read `variant.metadata?.pack_size` → `packSize`. Confirm `*variants` field
  selection includes variant metadata; add it if not.

### MOQ math (b2b-buy-panel.tsx)
- Each grid cell tracks a **stepper quantity** = number of packs the buyer wants.
- **Cell pieces** = `stepperQty × packSize`.
- `totalPieces = Σ(cell pieces)` across all cells.
- `meetsMoq = totalPieces ≥ moq`.
- The MOQ-remaining hint and the running total display **pieces**, not packs.
- Cart lines carry the **piece count** (`quantity × packSize`) and the per-piece
  price, so cart-side MOQ validation and pricing continue to count pieces.
  (Cross-check `lib/cart.ts` / `lib/b2b-cart-validation.ts` so line quantity is
  interpreted consistently — store pieces as the line quantity, and keep pack
  info for display.)
- Each pack variant's grid cell shows a small `×N pcs/pack` hint.

### Edge cases
- `packSize` missing or ≤ 0 → treat as 1.
- Stock clamping: available stock is in pieces; the max selectable packs for a
  cell = `floor(availablePieces / packSize)`.

---

## 2. Bulk Order Grid (replaces "Build your order")

- Rename the section heading **"Build your order" → "Bulk Order Grid"** in
  `b2b-buy-panel.tsx`.
- Replace the matrix's typed number inputs with **− / value / +** steppers
  (screenshots 3–4). The `+`/`−` buttons change the pack count by 1 (clamped to
  available packs). This likely means updating the shared `MatrixOrderGrid`
  component (in `@risitex/ui`) to a stepper cell, or wrapping cells with stepper
  controls. Keep row/column subtotals.

---

## 3. Removals on the PDP

Remove from `wholesale/p/[slug]/page.tsx` and `b2b-buy-panel.tsx`:
- **Request Sample** button/link (signed-in and signed-out).
- **Request Quote** button and `RequestQuoteModal` (signed-in and signed-out).
- **Cartons** stat in the summary; **Tier pricing** ladder + `MarginCalculator`;
  the "Master Carton" / "Case Pack" rows in the Wholesale Controls `InfoPanel`;
  the separate "Bulk Pricing" tier table section.
- Keep: **Total units (pieces)**, **Subtotal**, **MOQ** indicator, Add to cart.

The `RequestQuoteModal` component file can stay in the repo but is no longer
referenced from the PDP.

---

## 4. Product Description moved down

- Remove the description paragraph next to the product title.
- Add a dedicated **"Product Description"** section lower on the page rendering
  the description as a bulleted list (image 1 layout). Source: existing
  `product.description` / `product.specs` / any bullet metadata already present.

---

## 5. Size chart per garment type

- Pass the product's garment type into `SizeChartModal` (new prop, derived from
  `product.subcategory` / `product.eyebrow`, e.g. "Men · Shirts" → `Shirt`) so
  the modal opens on the correct tab. Fallback to the current default when
  unknown.
- **Innerwear/boxers** — convert `INNERWEAR_CHART` to the range format from
  image 2, waist-to-fit ranges:
  S 28-30, M 32-34, L 36-38, XL 40-42, 2XL 44-46, 3XL 48-50, 4XL 52-54.
  (Displayed as a "Waist (in)" range column, not a single number.)
- **Jeans** — remove the **Rise** dimension row; add a **Bottom** (leg-opening
  width) row with representative values per size.
- Keep the **T-Shirt, Shirt, Vest, Trouser** tabs as-is.

---

## 6. Delivery section (b2b checkout)

Reduce the delivery UI to two logical fields:
1. **Logistics Partner** dropdown — the existing transporter list **plus**
   `None` and `Self pickup` options.
2. Conditional fields:
   - **None** selected → reveal three **non-required** text inputs:
     **Logistics ID**, **Transporter ID**, **Phone**. Do **not** render an
     "(optional)" label. Values are captured and passed through to the order
     (metadata) with no validation.
   - **Self pickup** selected → reveal no extra fields.
   - A specific transporter selected → reveal no extra fields.
- Remove the ETA/charge display and the courier search box from
  `delivery-company-selector.tsx` (or introduce a simpler selector). Ensure the
  checkout still submits a valid shipping selection to Medusa (self-pickup /
  none map to a zero-cost or manual shipping option — verify the checkout
  submit path in `b2b/checkout/page.tsx`).

---

## 7. Catalogue: search bar + simple filter dropdowns

On `wholesale/catalogue/page.tsx`:
- Add a **search bar** that filters across **all** products (name, SKU, eyebrow,
  description). Wire to a `q` URL param consistent with the existing param-based
  filter model.
- Convert the current left **filter sidebar** into a horizontal row of **filter
  dropdown chips** matching image 3: **Availability, Size, Price, Color,
  Material**. Each chip opens a dropdown of choices on click. Reuse the existing
  `applyFilters` logic and facet computation; this is primarily a presentation
  change (sidebar → dropdown chips) plus the new search input and an
  Availability facet.

---

## Testing / verification

- MOQ math: a product with MOQ 4 and one pack-of-4 variant is satisfied by
  selecting 1 pack; a product with MOQ 240 and pack-of-1 variants behaves as
  before.
- Stock clamping never lets selected pieces exceed available pieces.
- PDP no longer shows request sample/quote, cartons, or tier ladder.
- Size chart opens on the right tab per product; jeans has no Rise, has Bottom;
  innerwear shows the 7 range rows.
- Checkout delivery: None reveals 3 optional fields, Self pickup reveals none,
  a transporter reveals none; order still completes.
- Catalogue search + dropdown filters produce the same result sets as the old
  sidebar filters.

## Out of scope

- No changes to `/products` page.
- No new custom admin screens (pack size uses native variant metadata).
- Pricing/tier engine internals unchanged (only the PDP display of tiers is
  removed).
