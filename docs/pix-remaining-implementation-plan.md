# PIX Storefront — Remaining Implementation Plan

Status as of 2026-06-18, audited against the **canonical backend `risitex-v2`** (not `risitex/apps/backend`,
which the storefront does not use) and the storefront in `risitex/apps/storefront`.

**Overall:** 26 Built · 8 Partial · 2 Missing (of 36 functional requirements).

Backend work lives in `risitex-v2`; storefront work in `risitex/apps/storefront`. Items marked
**(Frappe)** also depend on the external `risitex_erp` Frappe app, which is in neither repo and must be
verified there.

---

## Tier 1 — Correctness & blocking gaps (do first)

### 1. FR-9.02 — Available vs Physical quantity (oversell risk) · Missing · L · (Frappe)
Goal: MBOs see *Available* (Physical − reserved/pending-SO), never raw stock.
- Pull both `actual_qty` and reserved/`projected_qty` from the Frappe `Bin` doctype in the
  `INVENTORY_BIN` mapping (`risitex-v2/packages/medusa-plugin-erpnext/.../canonical-mappings.ts`).
- Store reserved qty on the inventory level; compute `available = stocked − reserved` in a
  `/store/b2b-sales/products/[id]/availability` resolver (or extend the pricing endpoint).
- Storefront: read Available (not `inventory_quantity`) in `b2b/inventory/page.tsx` (~L110) and the PDP buy panel.
- Decision: rely on ERPNext reserved/projected qty (recommended) vs. compute from open Sales Orders in Medusa.

### 2. FR-5.01 — ERP inventory reservation on checkout · Built-caveat · M · (Frappe)
Ensure the order→Sales Order mapping submits the ERPNext SO (docstatus=1) so Frappe reserves stock.
Mapping/config change in `ORDER_SALES_ORDER`; verify Frappe workflow. Pairs with #1.

### 3. FR-1.02 — Wire onboarding form to the real API · Partial · S
Confirm canonical entry point: `wholesale/apply/page.tsx` (already POSTs to `/store/companies/apply`)
vs `onboarding/b2b/page.tsx` (dummy 600 ms submit). Point the dummy submit at the real endpoint or
redirect/remove it. Backend endpoint exists and defaults to `pending`.

---

## Tier 2 — Revenue features

### 4. FR-6.01 / 6.03 / 6.04 — Finish the discount & promo engine · Partial · L
Build on the intended architecture: project rules into Medusa's native Promotion/Price-List system
(`projectRule()` stub, "Phase 2", in `risitex-v2/src/modules/b2b_pricing/service.ts`).
- **6.01 codes:** add `min_order_qty` + `max_usage_count` to `campaign` model; map to Medusa promotion
  usage-limit/min-item rules; add admin CRUD + a promo-code input in `checkout/wholesale/page.tsx`.
- **6.03 auto volume:** implement `projectRule()` — `createPromotion({ is_automatic: true })` with a
  cart-quantity / carton-count condition (e.g. >5 cartons → 5%).
- **6.04 stacking:** extend `promo_tier_conflict` in `risitex-v2/src/lib/b2b-cart.ts` (~L134) from blanket
  "manual codes don't stack" to a per-tier/per-promo matrix (`combinable_with_tier_ids` + admin config).
Sequence: 6.01 → 6.03 → 6.04.

### 5. FR-7.04 — Real affiliate/rep dashboards + missing affiliate commission · Partial · M
- **Functional gap:** add `risitex-v2/src/subscribers/order-placed-affiliate-commission.ts` — on a referred
  customer's first order, resolve referral → `earner_type='affiliate'`, `scope='referral_first'` →
  `earnCommission()`. Mirror `order-placed-commission.ts`, idempotent on `order_<id>`.
- **Un-mock dashboards:** wire `affiliate/dashboard/page.tsx` and `rep/dashboard/page.tsx` to real data
  (add `/store/*` rep/affiliate-scoped equivalents of `/admin/referrals` and `/admin/commissions`).
- Decision: FR-7.02 reward was changed from "₹5,000 on first order" to "KYC + cumulative-buy threshold."
  Revert to spec only if product still wants the original.

### 6. FR-8.05 — Confirm commission fields reach ERPNext · Built-caveat · S · (Frappe)
Rep ID + commission are on `order.metadata`; verify `ORDER_SALES_ORDER` mapping forwards
`sales_rep_employee_id` + `commission_amount_minor` into the ERPNext SO. Add custom-field mappings if not.

---

## Tier 3 — Integrations

### 7. FR-5.02 — Live courier tracking · Missing · L
Per-carrier API clients + polling job (or inbound webhooks for Shiprocket/Delhivery) in
`risitex-v2/src/modules/logistics`. Persist transit events on `ShipmentTransporter`; surface in
`b2b/shipments/page.tsx` (replace the "we don't yet poll…" placeholder). Build one carrier at a time.

### 8. FR-9.01 / 9.04 — Polling cadence + Finished-Goods scoping · Partial · S–M · (Frappe)
- 9.01: tighten pull cron in `packages/medusa-plugin-erpnext/src/jobs/pull-from-erpnext.ts` from
  `0 * * * *` (hourly) to `*/5 * * * *` if near-real-time is required.
- 9.04: constrain `INVENTORY_BIN` pull to the Finished-Goods warehouse via `pull_filter`.

---

## Tier 4 — Polish

### 9. FR-2.02 — Sub-category & pattern filtering · Partial · M
Add `subcategory` (Woven Inner Boxer / Boxer Shorts / Lounge Shorts / Pyjama) and `pattern` to product
taxonomy (Medusa categories or metadata); extend `components/plp/filter-rail.tsx` + PLP filter logic.
Requires catalog data entry.

### 10. FR-4.02 — Fix GST display mismatch · Polish · S
Backend computes CGST/SGST vs IGST correctly, but `checkout/wholesale/page.tsx` (~L256) hardcodes a 5%
IGST display line. Read actual tax lines back from the cart/order instead.

---

## Suggested sequencing
1. **Sprint 1 (risk):** #1 + #2 (together), #3.
2. **Sprint 2 (revenue):** #4, #5.
3. **Sprint 3 (integrations):** #7, #8, #6 + #10 verifications.
4. **Sprint 4 (polish):** #9.
