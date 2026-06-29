# PIX Discount Codes (FR-6.01) — Design

Date: 2026-06-18
Scope: **FR-6.01 only** — code-based promotional discounts. FR-6.02 (campaign
tracking) already ships; FR-6.03 (automatic volume discounts) and the FR-6.04
stacking *matrix* are explicitly out of scope here.

Repos: backend in `risitex-v2`, storefront/admin-consumer in
`risitex/apps/storefront`. The storefront talks to the `risitex-v2` backend.

## Goal

Let admins generate alphanumeric promo codes constrained by **minimum order
quantity** (in units), **maximum usage**, and **expiry**, and let buyers apply
them at wholesale checkout to get a real discount — built on Medusa's native
Promotion module, with optional unification with campaign tracking.

## Architecture & data model

A "discount code" **is** a Medusa native code-based Promotion — no new
persistence module. Medusa natively provides:

- the alphanumeric `code`
- the discount: application method `percentage` or `fixed`, order-level
- `usage_limit` → the "maximum usage limits" requirement

PIX-specific constraints that Medusa can't express live in `promotion.metadata`:

- `min_order_units: number` — the "valid only on 120+ units" rule (Medusa
  promotion rules target amounts/attributes, not summed line quantity)
- `expires_at: ISO string` — expiry, enforced at apply-time (kept off Medusa's
  own campaign object to avoid the Medusa-campaign vs RISITEX-campaign naming
  collision and keep enforcement in one place)
- `campaign_id: string | null` — link to the existing `marketing_campaign`
- `combinable_with_tier: boolean` — see "Tier exclusivity" below

Money is in **paise** (consistent with the rest of RISITEX); `min_order_units`
is a count of units (sum of cart line quantities), consistent with MOQ.

## Admin surface

Custom RISITEX admin page **"Discount codes"** plus endpoints:

- `POST /admin/discount-codes` — one call: create the Medusa promotion (code,
  type, value, `usage_limit`) and set the PIX `metadata`. If "track as campaign"
  is on, create/link a `marketing_campaign` with the same `code`.
- `GET /admin/discount-codes` — list (promotion + decoded metadata).
- `DELETE /admin/discount-codes/:id` — deactivate/remove.

Form fields: code, type (% or ₹ off), value, min units, max usage, expiry,
"combine with tier pricing?" toggle, optional "track as campaign".

## Apply / validate flow

- `POST /store/carts/:id/discount-code { code }` — looks up the promotion by
  code, then validates in this order, returning a clear error code on failure:
  - `invalid_code` (no active promotion with that code)
  - `expired` (`metadata.expires_at` < now)
  - `below_min_units` (sum of cart line quantities < `min_order_units`)
  - `usage_exhausted` (native `usage_limit` reached)
  On success, applies the native Medusa promotion to the cart (Medusa computes
  the discount) and returns the updated cart totals.
- `DELETE /store/carts/:id/discount-code` — remove the applied code.

The same validation is re-run at place-order so a code can't survive a cart edit
that drops it below `min_order_units` or past `expires_at`; a now-invalid code is
removed (or the order is blocked) rather than silently honored.

Storefront: the **wholesale checkout** gets a promo-code input that calls these.
The applied discount appears as a summary line and flows through the cart `total`
the checkout already reads (so GST/total stay consistent with FR-4.02).

## Campaign attribution (unified)

Essentially free: the existing `order-placed-campaign` subscriber attributes by
matching `order.promotions[].code` to a `marketing_campaign.code`. A code whose
promotion code equals a campaign code is therefore tracked automatically; the
admin "track as campaign" toggle just guarantees the campaign row exists.

## Tier exclusivity (interaction with partial FR-6.04)

`risitex-v2/src/lib/b2b-cart.ts` already raises `promo_tier_conflict` for B2B
carts when a manual promo lacks `metadata.combinable_with_tier === true`. So
6.01 codes **must** set `combinable_with_tier` from the admin toggle, or they'd
be rejected on B2B carts. This design wires the toggle through. The full
per-tier stacking matrix remains deferred to FR-6.04.

## Testing

- TDD the pure validators (expiry check, min-units check, usage check) as a
  small unit-tested helper module.
- Thin integration coverage for the apply endpoint and admin endpoint where
  feasible (full container runs are out of band; note any gaps).

## Defaults (baked in)

- Discounts are **order-level** (not item/category-scoped).
- `min_order_units` = total units across the cart.
- Both **percentage** and **fixed ₹** discounts supported.

## Out of scope

- FR-6.03 automatic volume discounts (no-code) — will reuse the promotion-
  creation helper via `projectRule`/`DynamicRule` in a later spec.
- FR-6.04 stacking *matrix* — only the existing `combinable_with_tier` flag is
  honored here.
- Item/category-scoped discounts; per-customer code allocation.
