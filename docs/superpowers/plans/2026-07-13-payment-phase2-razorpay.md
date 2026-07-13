# Payment Phase 2 — Razorpay live checkout + webhooks

> Extends Phase 1 (`2026-07-13-payment-manual-upi-razorpay.md`). Reuses RISITEX's own Razorpay (`razorpay_provider` + the wallet-topup pattern). Builds on the reuse map from the recon agent.

**Goal:** make the Razorpay checkout card actually complete a payment end-to-end — create Razorpay order → open Checkout → verify signature → order Paid + auto-Approved → dispatch — plus a signature-verified, idempotent webhook layer.

## Architecture decisions (driven by the reuse map)

- **Mirror the wallet top-up flow, not the cart pipeline.** The B2B checkout creates the order inline via `/store/purchase-orders`; there is no cart/payment-session. So: **pay-then-place** — create a Razorpay order first, open Checkout, and only create the PO/order after signature verification.
- **Dev pass-through preserved.** `RAZORPAY_KEY_ID/SECRET` empty ⇒ synthetic order id + auto-success (no overlay), exactly like wallet top-up. Everything below is testable locally in this mode; live charge + live webhook need real keys + a public URL.
- **Razorpay auto-approves.** Unlike Manual UPI (admin-verified), a signature-verified Razorpay payment is "automatic": on verify success the order goes straight to `payment_status=paid` + `admin_approved_at` (auto) + order `b2b_approved_at` → dispatch unlocked. No admin verification step.
- **Gateway fee:** buyer is charged `finalPayable = grandTotal + gatewayFee`. PO `value_major` + `amount_paid_major` = finalPayable; native Medusa order stays at grandTotal (goods+GST+shipping); the fee is recorded in metadata (`gateway_charge_major`, `gateway_charge_percent`). Minor accounting split, clearly recorded — refine later if needed.
- **No 4th copy of the HMAC/REST logic:** add a backend `lib/razorpay.ts` shared helper (live-mode check, create-order, verify-signature, fetch-payment, verify-webhook-signature). New endpoints + the PO route + the webhook use it. Leave the working wallet-topup routes untouched.

## Files

**Backend — create:**
- `apps/backend/src/lib/razorpay.ts` — `razorpayLiveMode()`, `createRazorpayOrder(amountPaise, receipt, notes)`, `verifyRazorpaySignature({order_id,payment_id,signature})`, `fetchRazorpayPayment(id)`, `verifyRazorpayWebhookSignature(rawBody, signatureHeader)`. Env-driven; dev-mode branches mirror `razorpay_provider/service.ts` + `wallet/topup`.
- `apps/backend/src/lib/__tests__/razorpay.test.ts` — vitest for the pure signature verifier (known HMAC vectors) + webhook verifier + dev-mode short-circuits.
- `apps/backend/src/api/store/purchase-orders/razorpay/order/route.ts` — `POST` create a Razorpay order for a given amount (items→total or amount_paise), returns `{mode, key_id, razorpay_order_id, amount_paise, currency}`. Auth: customer + verified (inherits `/store/purchase-orders*` middleware).
- `apps/backend/src/api/webhooks/razorpay/route.ts` — `POST` webhook. Verify `X-Razorpay-Signature` (HMAC-SHA256 over raw body, `RAZORPAY_WEBHOOK_SECRET`); handle `payment.captured`, `payment.failed`, `payment.authorized`, `refund.created`, `refund.processed`, `order.paid`; idempotent (dedup by `event.id` / payment id in a small table or PO metadata guard); reconcile the linked order/PO `payment_status`. Inherits `/webhooks/*` raw-body middleware.

**Backend — modify:**
- `apps/backend/src/api/store/purchase-orders/route.ts` — extend the `payment` zod union to also accept `{method:"razorpay", razorpay_order_id, razorpay_payment_id, razorpay_signature, amount_paid_major, gateway_charge_major}`. On razorpay: `verifyRazorpaySignature` (dev passthrough / live HMAC; live also `fetchRazorpayPayment` to confirm captured/authorized + amount), then write PO+order metadata `payment_method=razorpay, payment_status=paid, razorpay_payment_id, gateway_charge_major, admin_approved_at=now` and mirror `b2b_approved_at` on the order. Reject on signature/amount mismatch (422). Manual UPI branch unchanged.
- `apps/backend/src/admin/widgets/b2b-order-approval.tsx` — extend the Payment block: show `razorpay_payment_id` + `gateway_charge` when method=razorpay.

**Storefront — create:**
- `apps/storefront/src/lib/razorpay.ts` — `loadRazorpayScript()`, `openRazorpayCheckout({keyId, orderId, amount, onSuccess, onDismiss})` (extracted pattern from `instant-topup-section.tsx`), `startRazorpayOrder(amountPaise)` → POST the new create-order endpoint. Window.Razorpay typing.

**Storefront — modify:**
- `apps/storefront/src/app/b2b/checkout/page.tsx` — Razorpay panel gets a **Pay with Razorpay** button. Click → `startRazorpayOrder(finalPayablePaise)` → if dev-passthrough (empty key_id) synthesize success, else `openRazorpayCheckout` → on `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` call `createPurchaseOrder({..., value_major: finalPayable, payment:{method:"razorpay", ...ids, amount_paid_major: finalPayable, gateway_charge_major}})` → success page. Replace `paymentReady()`’s `razorpay→false` and remove the `placeOrder` razorpay block; the razorpay path runs through the pay button, not the generic "Place order".
- `apps/storefront/src/lib/purchase-orders.ts` — widen `CreatePurchaseOrderInput.payment` union to include the razorpay shape.

## Verification (local, dev pass-through)

- vitest: signature + webhook verifiers (known vectors), dev-mode short-circuits.
- API: `POST /store/purchase-orders/razorpay/order` → `{mode:"passthrough", key_id:"", razorpay_order_id:"order_dev_…"}`; then `POST /store/purchase-orders` with a razorpay payment (passthrough) → order `paid` + `admin_approved_at` + `b2b_approved_at`; appears approved (NOT in the manual-UPI verification queue).
- Webhook: POST a simulated `payment.captured` body with a correct HMAC computed from a test `RAZORPAY_WEBHOOK_SECRET` → 200 + idempotent on repeat; wrong signature → 401.
- Browser: Razorpay card → Pay with Razorpay → (dev) instant success → success page.

## Needs YOU (can't verify here)

- Real Razorpay **test keys** in `apps/backend/.env` (`RAZORPAY_KEY_ID/SECRET`) to exercise a real order + overlay.
- A public **webhook URL** (ngrok/cloudflared) + `RAZORPAY_WEBHOOK_SECRET` set in `.env` and in the Razorpay dashboard, to verify the live callback.
