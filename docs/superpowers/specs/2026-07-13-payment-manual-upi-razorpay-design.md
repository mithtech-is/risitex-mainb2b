# Payment Overhaul — Manual UPI + Razorpay (Phase 1)

**Date:** 2026-07-13
**Branch:** `feat/pdp-mrp-whatsapp-cleanup`
**Status:** Approved design — ready for implementation plan

## Goal

RISITEX checkout should offer **exactly two** payment options and nothing else:

1. **Manual UPI Payment** — badge "0% Charges". A manual bank/UPI transfer the
   buyer completes in their own UPI app, then records the transaction ID.
   Verified by an admin before the order is approved.
2. **Razorpay Payment** — badge "(+X% Gateway Charges)" where X is set by the
   admin at runtime. Automatic online payment.

Every other current method (`wallet`, `wallet_plus_razorpay`, and any legacy
online option) is removed from checkout.

## Scope

**Phase 1 (this spec):**
- Checkout consolidated to the two methods above.
- Full Manual UPI capture flow at checkout + admin payment-verification page.
- `payment_settings` module so admin configures gateway %, UPI ID, QR image,
  and enable flags at runtime.
- Dynamic gateway-charge display when Razorpay is selected.
- Admin order page shows payment method / status / gateway charges / txn ID.

**Phase 2 (deferred — needs real keys + public webhook URL):**
- Razorpay checkout open + signature-verified capture end-to-end (reusing the
  existing `razorpay_provider` module and `/store/checkout/razorpay/verify`).
- Webhook handlers: `payment.authorized`, `payment.captured`, `payment.failed`,
  `refund.created`, `refund.processed`, `order.paid` — signature-verified,
  idempotent.
- Auto-capture / sandbox-vs-production toggles wired to live behaviour.

## Key facts established during audit

- **Polemarch has no Razorpay.** It uses Cashfree (`cashfree_wallet_provider`).
  The "reuse Razorpay from Polemarch" premise does not hold; nothing to copy
  there.
- **RISITEX already owns a Razorpay integration**: `razorpay_provider` module
  (registered as `razorpay`, exposed as `pp_razorpay_razorpay`), keys present in
  `apps/backend/.env` (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` /
  `RAZORPAY_WEBHOOK_SECRET`), and a `/store/checkout/razorpay/verify` route doing
  HMAC-SHA256 signature verification. Phase 2 **reuses** this, does not rewrite.
- Existing checkout creates a **purchase order** (`createPurchaseOrder`) with
  metadata-based status fields (`admin_approved_at`, `dispatched_at`, …). Manual
  UPI capture and admin verification hang off this existing flow — no new
  order-creation path.
- The existing `b2b-approve` admin flow already sets `admin_approved_at` and
  gates dispatch. Manual UPI approval reuses it and additionally marks payment
  paid.

## Architecture

### A. `payment_settings` module (new, backend)

A single-row config module — idiomatic Medusa v2, matches existing custom
modules (`purchase_order`, `razorpay_provider`).

**Model `payment_setting` (single row, id = `payment_settings`):**

| field | type | default | purpose |
|---|---|---|---|
| `manual_upi_enabled` | bool | `true` | show Manual UPI card |
| `razorpay_enabled` | bool | `true` | show Razorpay card |
| `upi_id` | text | `risitex@upi` | displayed + copyable |
| `upi_qr_image_url` | text | `null` | QR image; null → placeholder |
| `gateway_charge_percent` | numeric | `2` | Razorpay surcharge % |
| `razorpay_mode` | text | `sandbox` | `sandbox` \| `production` (Phase 2) |
| `auto_capture` | bool | `true` | Phase 2 |

Keys/secrets stay in `.env` (never in the DB row). The module exposes only
non-secret config.

**APIs:**
- `GET /admin/payment-settings` → full row (admin only).
- `POST /admin/payment-settings` → update row (validated).
- `GET /store/payment-settings` → public subset only:
  `{ manual_upi_enabled, razorpay_enabled, upi_id, upi_qr_image_url, gateway_charge_percent }`.

**Admin settings UI:** a Settings route/page under Medusa admin to edit the row.

### B. Checkout UI (`apps/storefront/src/app/b2b/checkout/page.tsx`)

Replace `PAYMENT_METHODS` (3 entries) with two:

```
manual_upi   → "Manual UPI Payment", badge "0% Charges"
razorpay     → "Razorpay Payment",   badge "(+X% Gateway Charges)"  (X from settings)
```

On mount, fetch `GET /store/payment-settings`. Hide a card if its enable flag is
false. If only one is enabled, auto-select it.

**Manual UPI selected → UPI panel:**
- QR block: image from `upi_qr_image_url`, else placeholder card with text
  "Official RISITEX QR will be uploaded soon."
- UPI ID row: `upi_id` + **Copy UPI ID** button (clipboard) + optional
  **Download QR** (only if image present).
- **Amount to Pay** — pre-filled = current grand total (goods + 5% GST +
  shipping). Read-only. No gateway charge, no extra GST — "0% Charges".
- Instruction text: pay the exact amount to the UPI ID above, then enter the
  reference below.
- Fields:
  - **UPI Transaction ID*** — validate: non-empty, trimmed length 6–40,
    alphanumeric (`/^[A-Za-z0-9]+$/`). Inline error on blur/submit.
  - **Payment Date** — date input, defaults to today, not in the future.
  - **Remarks** — optional textarea.
  - **Upload Screenshot** — optional image upload → stored URL.
- Primary button: **Verify & Continue** → runs validation → calls
  `createPurchaseOrder` with the manual-UPI payload → success page.

**Razorpay selected → charge breakdown:**
- Sub-label: "UPI · Cards · Net Banking · Wallets".
- Live breakdown from `gateway_charge_percent`:
  `Subtotal (incl. GST + shipping)` → `Gateway Fee (X%)` → `Final Payable`.
- Phase 1 shows the option + dynamic charges. The "Pay with Razorpay" action is
  stubbed with a clear "coming in Phase 2" affordance (disabled or a notice) so
  Phase 1 never half-charges anyone. Phase 2 wires the real open+verify.

Gateway fee helper (frontend + mirrored server-side in Phase 2):
`gatewayFee = round(grandTotalPaise * pct / 100)`, `finalPayable = grandTotal + gatewayFee`.

### C. Manual UPI capture (backend)

`createPurchaseOrder` (storefront lib → `POST /store/purchase-orders`) accepts an
optional `payment` object:

```ts
payment?: {
  method: "manual_upi";
  upi_transaction_id: string;
  payment_date: string;      // ISO date
  remarks?: string;
  screenshot_url?: string;
  amount_paid_major: number; // rupees, = grand total
}
```

Server re-validates (method whitelist, txn id format/length, amount matches the
computed order total within tolerance, date not future) and writes to PO
metadata:

```
payment_method:        "manual_upi"
payment_status:        "awaiting_verification"
upi_transaction_id, payment_date, remarks, screenshot_url,
amount_paid_major, payment_captured_at (server timestamp)
```

Order status remains "Pending Admin Payment Verification" (no `admin_approved_at`
yet). Never trust the client amount — server computes the authoritative total and
rejects mismatches.

### D. Admin payment-verification page (new admin route)

`apps/backend/src/admin/routes/payment-verifications/page.tsx`
(`defineRouteConfig({ label: "Payment Verification", icon: CurrencyDollar })`).

- Lists POs where `payment_method=manual_upi` and
  `payment_status=awaiting_verification`.
- Per row / detail: Order #, Customer, Company, Amount, Transaction ID,
  Screenshot (thumbnail → open), Remarks, submitted timestamp.
- Actions:
  - **Approve** → reuses existing `b2b-approve` (sets `admin_approved_at`) **and**
    sets `payment_status=paid`, `payment_verified_at`, `payment_verified_by`.
    Order → Approved → existing Warehouse/Dispatch/Tracking/Invoice flow.
  - **Reject** → `payment_status=rejected`, `payment_rejected_reason`. Order not
    approved.
  - **Request Clarification** → `payment_status=clarification_requested`,
    `clarification_note`. Buyer sees the note on their order page.

Backend endpoint: `POST /admin/payment-verifications/:poId/decide`
`{ decision: "approve"|"reject"|"clarify", note? }` — validated, sets the fields,
and for approve calls the existing approve path so there is one source of truth.

### E. Admin order display

Extend the existing `b2b-order-approval` widget to render a **Payment** block:
Method, Status (badge), Amount Paid, Gateway Charges (Razorpay only),
Transaction ID. Phase 2 adds Razorpay Payment ID / Webhook Status /
Verification timestamp.

## Data flow (Manual UPI, happy path)

1. Buyer at checkout selects Manual UPI, pays in their UPI app, enters txn ID +
   date (+ optional remarks/screenshot), clicks Verify & Continue.
2. Frontend validates → `createPurchaseOrder({ ..., payment: {manual_upi...} })`.
3. Backend re-validates, creates PO with `payment_status=awaiting_verification`,
   order status "Pending Admin Payment Verification". Success page shows the
   green "order placed, pending verification" state (existing success UI).
4. Admin opens Payment Verification, reviews txn ID / screenshot / amount,
   clicks Approve.
5. Backend sets `payment_status=paid` + `admin_approved_at` via existing approve.
   Order → Approved → existing dispatch/tracking/invoice flow unlocks.

## Error handling

- **Frontend validation:** inline errors; submit blocked until txn ID valid and a
  method is selected. Settings fetch failure → sane defaults
  (`gateway_charge_percent=2`, both enabled, `upi_id=risitex@upi`) so checkout
  never hard-fails.
- **Backend validation:** method whitelist, txn ID format/length, server-computed
  amount match (reject client-supplied mismatches), date-not-future. 400 with a
  clear message on failure.
- **Idempotency (settings/decide):** decision endpoint is safe to call twice —
  approving an already-approved PO is a no-op, not a double-approve.
- **Screenshot upload:** optional; upload failure must not block order placement
  (buyer can submit without it; admin can request clarification).

## Testing

- **Unit:** gateway-fee helper (rounding, 0%, integer paise); txn-ID validator
  (empty, too short/long, non-alphanumeric, valid); amount-match server check.
- **Backend integration:** `GET/POST /admin/payment-settings` round-trip;
  `GET /store/payment-settings` exposes only the public subset (no secrets);
  `createPurchaseOrder` with manual-UPI payload persists metadata + status;
  `decide` transitions approve/reject/clarify and approve is idempotent.
- **Manual E2E (local):** checkout with each method visible per enable flags;
  Manual UPI capture → appears in admin verification → approve → order approved →
  dispatch unlocks. Razorpay card shows dynamic % and the Phase-2 notice.
- **Not testable in Phase 1:** live Razorpay charge + webhooks (needs real keys +
  public URL) — explicitly Phase 2.

## Out of scope / will not touch

- Existing PO/order architecture, dispatch/tracking/invoice flow, unrelated
  modules, and the `razorpay_provider` internals (surfaced, not rewritten).
- No project rebuild, no checkout-flow re-architecture.

## Manual config steps (for the user, after implementation)

- Confirm `.env` Razorpay keys are the intended sandbox/production keys.
- In admin **Payment Settings**: set gateway charge %, upload the official UPI QR,
  set the real UPI ID, toggle enable flags.
- Phase 2 only: set the public **Webhook URL** in the Razorpay dashboard and the
  matching `RAZORPAY_WEBHOOK_SECRET`.
