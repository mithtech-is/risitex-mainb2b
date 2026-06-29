# Cashfree Wallet + Secure ID — Setup Runbook

This is the operational runbook for the wallet + VBA + Secure ID integration
shipped across 12 phases. Architecture lives in
`~/.claude/plans/starry-tumbling-rocket.md`; this doc tells you what to
configure and how to verify it end-to-end.

## 1. Environment variables

Add to `backend/.env` (copy from `.env.example` if it exists, otherwise
create):

```
# Cashfree environment (sandbox for development, production when live)
CASHFREE_ENV=sandbox

# Verification / Secure ID credentials from Cashfree dashboard →
# Developers → API Keys → Verification
CASHFREE_CLIENT_ID=...
CASHFREE_CLIENT_SECRET=...

# Payouts / Virtual Accounts credentials. If omitted, falls back to the
# Verification pair (fine for sandbox when Cashfree issues a single key).
CASHFREE_PAYOUTS_CLIENT_ID=...
CASHFREE_PAYOUTS_CLIENT_SECRET=...

# Webhook secrets. The VBA/payouts webhook uses CASHFREE_WEBHOOK_SECRET.
# The verification webhook optionally uses CASHFREE_VERIFY_WEBHOOK_SECRET
# (falls back to CASHFREE_WEBHOOK_SECRET).
CASHFREE_WEBHOOK_SECRET=...
CASHFREE_VERIFY_WEBHOOK_SECRET=

# Display name prefix for virtual accounts (shown on the remitter's bank
# statement when the customer tops up).
CASHFREE_VBA_PREFIX=POLEMARCH

# At-rest encryption key for bank account numbers, SMTP password, and
# other DB-stored secrets. Min 16 chars. Rotating this requires a one-time
# re-encryption migration (out of scope here). Legacy alias
# `WALLET_ENCRYPTION_KEY` is still accepted for back-compat.
AT_REST_ENCRYPTION_KEY=<strong random string, 32+ chars>
```

Rotate these whenever a credential is exposed — all Cashfree calls fail
loud with 401/403 if a key is revoked, so you'll see the breakage fast.

## 2. Database migration

The module ships one migration adding 9 tables:
`wallet`, `wallet_transaction`, `bank_account`, `demat_account`,
`cashfree_virtual_account`, `secure_id_verification`,
`wallet_payment_attempt`, `held_order`, `cashfree_webhook_event`.

```bash
cd backend
npx medusa db:migrate
```

The legacy `kyc_request` table is left in place (read-only audit). No
destructive changes.

## 3. Cashfree dashboard configuration

1. **API keys**: Developers → API Keys. Copy the Verification and Payouts
   client id / secret into `.env`.
2. **Webhooks**: Developers → Webhooks. Add two endpoints pointing at
   your backend:
   - `https://<your-backend>/webhooks/cashfree/vba` — enable the VBA
     credit / Payouts transfer events
   - `https://<your-backend>/webhooks/cashfree/verification` — enable
     the async verification events (CMR extraction, etc.)
3. Copy the signing secret into `CASHFREE_WEBHOOK_SECRET` (and the
   verification-specific secret into `CASHFREE_VERIFY_WEBHOOK_SECRET` if
   it's separate).

For local dev, run `ngrok http 9000` and point the sandbox webhooks at
the ngrok URL.

## 4. Smoke test

With the backend running:

```bash
# 1. Type-check (should be zero output)
cd backend && npx tsc --noEmit
cd ../storefront && npx tsc --noEmit

# 2. Unit tests for the security-critical helpers
node backend/tests/cashfree-wallet.test.mjs
# → 28 passed, 0 failed

# 3. Medusa full build (config + migrations + admin bundle)
cd backend && npx medusa build
# → Backend build completed ... Frontend build completed

# 4. Credential smoke test (dev-only, 404 in production)
#    Log in to the admin, then:
curl -b cookies -X GET http://localhost:9000/admin/dev/cashfree-ping
# Expected: { configured: { verification: true, payouts: true, ... },
#            ping: { ok: true, message: "creds_ok (api responded 422)" } }
```

## 5. End-to-end flow walkthrough

1. Register + log in on the storefront (`/register` → `/login`).
2. Complete KYC stepper at `/dashboard/kyc`:
   - Step 1 PAN: enter a sandbox-valid PAN + name. Cashfree returns
     `VALID` → `pan_verified` becomes true.
   - Step 2 Aadhaar: use a sandbox test Aadhaar. Cashfree sandbox OTP is
     always `123456`. `aadhaar_verified` becomes true.
3. Add a bank account at `/dashboard/bank-accounts`. Use Cashfree's test
   IFSC `CASH0000001` and any account number (sandbox returns
   `name_match_score` based on the fixture). First verified account
   becomes primary automatically.
4. Upload a CMR PDF and add a demat at `/dashboard/demat-accounts`.
   Select CDSL (16-digit BO ID) or NSDL (`INxxxxxx` + 8-digit client id).
   First verified demat becomes primary.
5. `/dashboard/wallet` provisions a Cashfree Virtual Account the first
   time you land on it. Copy the account number + IFSC.
6. Top up — from the Cashfree sandbox dashboard (Payouts → Virtual
   Accounts → Simulate) send a credit to the VBA. The webhook fires,
   wallet balance increments.
7. Add a deal to cart → `/checkout`. The precheck shows wallet balance
   vs cart total; if sufficient the button says "Pay from wallet"; if
   short, it shows the shortfall and VBA details. Confirm and the wallet
   is debited (or the cart is held pending a top-up).

## 6. Admin operations

Navigate to the admin and click **Wallet & Payments** in the sidebar.
The page has four tabs:

- **Held orders** — any PaymentAttempt stuck waiting for funds. Cancel
  from here if a customer abandons.
- **Customer wallet** — look up a customer by id, see their balance + VBA
  + full ledger, manually credit/debit (reason required, audit-logged).
- **Webhook events** — inspect recent inbound webhook deliveries + their
  processing status. First stop for "the VBA credit didn't arrive" bugs.
- **Secure ID audit** — history of every PAN / Aadhaar / penny-drop /
  CMR verification call. Only masked PII is stored.

The legacy **KYC Requests** admin page now shows a redirect notice —
manual review is retired.

## 7. When things break

| Symptom | First check |
|---|---|
| KYC step 1 returns 500 | `/admin/dev/cashfree-ping` — credentials? |
| VBA top-up doesn't credit wallet | **Webhook events** tab — did the event arrive? If yes, what's `processing_status`? If no, is the public webhook URL reachable? Is `CASHFREE_WEBHOOK_SECRET` correct? |
| "Signature mismatch" 401 in logs | Secret drift — rotate and confirm on both Cashfree dashboard and `.env`. |
| Checkout says "KYC required" but customer finished stepper | Hit `GET /store/kyc/status` as the customer — the four flags must all be true. If any is false, the derived status is `in_progress`, not `approved`. |
| Double credit on the wallet | Shouldn't happen — `WalletTransaction.cashfree_event_id` is unique. If you see it, check that the webhook is sending the same `event_id` twice and file a bug. |

Pure helpers are tested at `backend/tests/cashfree-wallet.test.mjs` — 28
cases covering signature verify, AES-GCM round-trip, PII masking, and
the in-memory rate limiter.
