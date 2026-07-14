# WhatsApp templates (polyg.in) + PDP "Ask on WhatsApp" button — Design

- **Date:** 2026-07-14
- **Status:** Approved-in-substance (config supplied); pending final spec review
- **Branch:** `feat/whatsapp-templates-pdp-button`

## Context

RISITEX runs WhatsApp through **polyg.in** (Polygin), which forwards Meta
template create/send calls. The backend module
`apps/backend/src/modules/polemarch_communication` already contains a full
catalog of 15 WhatsApp templates
(`seed/default-whatsapp-templates.ts`) and a push path to polyg.in
(`pushWhatsappTemplateToPolygin` → `POST /api/user/add_meta_templet`), but
**no template has ever been pushed** (the Polygin config was never populated).

Two gaps motivated this work:

1. The manual-UPI **"payment pending verification"** flow
   (`store/purchase-orders/route.ts` → `payment_status:"awaiting_verification"`;
   admin decides in `payment-verifications/[id]/decide/route.ts`) **emits no
   events and sends no notification** at submit / verify / reject / clarify.
   The customer only learns of approval by the success page polling every 5s.
   There is no template for it in any channel.
2. The product page has a floating WhatsApp button whose prefilled product
   name is **guessed from the URL slug**. There is no inline "Ask on WhatsApp"
   button carrying the exact product name (à la
   `https://polemarch.in/invest/api-holdings`).

## Goals

- Create **all missing** WhatsApp templates on polyg.in (the existing 15 + new
  payment-verification ones), idempotently and repeatably.
- Make the payment-verification messages actually **fire** (emit events + wire
  the notification map).
- Add an **inline** "Ask on WhatsApp" button on the PDP with the exact
  `product.name`, and improve the existing floating button's name.

## Non-goals (out of scope for this change)

- Email / SMTP wiring (the `contact@lamongie.in` / `box.mith.in` mailbox is
  noted but belongs to the separate email subsystem).
- SMS (MSG91) templates for the new payment events — WhatsApp first; SMS/email
  equivalents can follow.
- Razorpay flow changes (it auto-approves; no verification step).

## Config (non-secret)

Brand substitution values baked into templates at push time:

| placeholder | value |
|---|---|
| `{{brand}}` | `RISITEX` |
| `{{storefront_url}}` | `https://lamongie.in` |
| `{{support_email}}` | `contact@lamongie.in` |
| `{{support_phone}}` / admin alert / button number | `+918660381681` (digits `918660381681`) |
| `{{tagline}}` | `B2B Textile Commerce` |
| test recipient | `9741432118` |

Secrets (polyg.in REST token + **fresh** dashboard JWT) live only in a
gitignored `apps/backend/.env.polygin.local`, never in code or this doc.

> **Brand/domain note:** RISITEX-branded copy on a `lamongie.in` domain is a
> mild mismatch Meta reviewers sometimes flag. Accepted as intentional.

## Part A — Templates

### A.1 Existing 15 (unchanged)

Auth OTP (login / phone-verify / password-reset), password-changed, welcome,
password-reset, order (placed / payment_captured / canceled / shipped /
delivered), wallet (credited / debited), company (approved / rejected). These
are pushed as-is.

### A.2 New payment-verification templates (UTILITY)

Added to `seed/default-whatsapp-templates.ts`, following the `risitex_*_v1`
naming + positional-var convention. Copy shown with brand placeholders (baked
at push):

| slug / Meta name | recipient | body | vars |
|---|---|---|---|
| `payment.upi_submitted` / `risitex_payment_upi_submitted_v1` | customer | "Hi {{1}}, we've received your UPI payment of ₹{{2}} for {{brand}} order #{{3}} (ref {{4}}). Our team is verifying it — you'll get a confirmation shortly. No action needed." + "View order" URL button | first_name, amount_inr, order_id, upi_ref |
| `payment.verified` / `risitex_payment_verified_v1` | customer | "Hi {{1}}, your payment of ₹{{2}} for {{brand}} order #{{3}} is verified ✅. Your order is confirmed and moving to fulfilment." + "View order" | first_name, amount_inr, order_id |
| `payment.rejected` / `risitex_payment_rejected_v1` | customer | "Hi {{1}}, we couldn't verify your payment for {{brand}} order #{{2}}. Reason: {{3}}. Please re-share a valid UPI reference / screenshot, or contact us at {{support_phone}}." | first_name, order_id, reason |
| `payment.clarification` / `risitex_payment_clarification_v1` | customer | "Hi {{1}}, we need a bit more to verify your payment for {{brand}} order #{{2}}: {{3}}. Reply here or update your payment details." | first_name, order_id, note |
| `admin.payment_pending` / `risitex_admin_payment_pending_v1` | **admin (static)** | "🔔 New UPI payment awaiting verification — {{brand}} order #{{1}}, ₹{{2}}, UPI ref {{3}} from {{4}}." | order_id, amount_inr, upi_ref, customer_name |

Optional (not default): an IMAGE-header variant of `admin.payment_pending`
echoing the customer's uploaded screenshot so it can be verified from WhatsApp.
Deferred — adds per-send media-handle upload complexity.

## Part B — Event wiring (so payment templates fire)

New domain events + emit points:

| event | emitted from | recipients (WhatsApp event-map rows) |
|---|---|---|
| `payment.upi_submitted` | manual-UPI branch of `store/purchase-orders/route.ts` (after writing `awaiting_verification`) | `payment.upi_submitted` → customer_phone; `admin.payment_pending` → static `+918660381681` |
| `payment.verified` | `payment-verifications/[id]/decide` (approve) | `payment.verified` → customer_phone |
| `payment.rejected` | decide (reject) | `payment.rejected` → customer_phone |
| `payment.clarification` | decide (clarify) | `payment.clarification` → customer_phone |

- Event payloads carry `customer_id` (both routes have it) so the
  `customer_phone` resolver in `sendEventNotification` can look up the number,
  plus the template variable values (name, amount, order display id, upi ref,
  reason/note).
- Register the 4 events in `subscribers/notification-handler.ts`.
- Add rows to `seed/default-whatsapp-event-maps.ts` (and a migration/seed run
  so existing DBs pick them up). Two rows key off `payment.upi_submitted` (the
  customer message + the static admin alert).
- Email/SMS event-map + template equivalents: optional follow-up.

## Part C — Push script

`apps/backend/scripts/push-polygin-templates.ts`, run with `npx tsx` — **no
Medusa/DB boot**:

1. `GET https://polyg.in/api/user/get_my_meta_templets` (dashboard JWT) → set of
   template names already on the account.
2. For every catalog template **not** present → substitute brand placeholders
   (ported from `substituteBrandInComponents`) → `POST /api/user/add_meta_templet`
   with `Authorization: Bearer <dashboard JWT>` and body `{..., token: <REST token>,
   parameter_format:"POSITIONAL"}`.
3. `--dry-run` prints each resolved payload and the create/skip decision without
   posting. Run first, review, then push on explicit go.
4. Idempotent: re-runs only fill gaps. Reports per-template ok / skip / error.
5. Reads `POLYGIN_TOKEN` (REST) + `POLYGIN_DASHBOARD_JWT` (dashboard session)
   from `apps/backend/.env.polygin.local`.

**Auth reality (validated 2026-07-14):** the token supplied is rejected by
`/api/user/*` with `"Session expired"`. Those endpoints need the **dashboard
session JWT** (`localStorage.wacrm_user`), which expires quickly. Both the REST
token and a fresh dashboard JWT are visible in the operator's logged-in polyg.in
session and are captured **at push time** (via the browser, no chat paste).

## Part D — PDP buttons (storefront)

1. **Inline button** — `components/product/product-hero.tsx`, after the price
   block. Client component with `product` in scope. `@risitex/ui` `Button asChild`
   → `<a target="_blank" rel="noopener noreferrer">` with the WhatsApp glyph.
   Message: `Hi RISITEX, I'm interested in "<product.name>"[ (MRP ₹X/pc)] — <origin><pathname>`.
   Origin resolved after mount (hydration-safe, matching the floating button).
   Renders for signed-in and signed-out visitors. Hidden if number unset.
2. **Floating button** — `components/site/whatsapp-button.tsx`: improve the
   slug→name humanization (decode, replace dashes, title-case, drop trailing
   SKU digits) so its prefilled name reads cleanly. (It is global and cannot see
   `product.name`.)
3. **Env** — set `NEXT_PUBLIC_WHATSAPP_NUMBER=918660381681` in
   `apps/storefront/.env.local`.

## Verification

- **Templates/script:** `--dry-run` output reviewed; after real push, re-list
  and confirm each new name present with status `pending`/`pushed`; later sync
  to `approved`.
- **Event wiring:** trigger a manual-UPI order in dev → assert `payment.upi_submitted`
  emitted and a WhatsApp send row created for the customer + admin number; run
  admin approve/reject/clarify → assert the matching template send. Use the test
  number `9741432118`.
- **Buttons:** load a PDP, confirm the inline button opens `wa.me/918660381681`
  with the exact product name in the text; confirm the floating button's name
  reads cleanly.

## Risks / open items

- **Dashboard JWT expiry** — capture fresh at push time; the pasted token is the
  REST token (or an expired session).
- **Meta review** — AUTHENTICATION OTP templates already use the correct shape;
  new UTILITY templates are plain transactional text (low rejection risk). Brand
  ≠ domain is the only reviewer nit.
- **Event-map fan-out** — confirm `sendEventNotification` selects *all* rows
  matching an `event_name` (needed for the customer + admin rows on submit); if
  not, emit a separate `admin.payment_pending` event instead.
