# RISITEX backend

MedusaJS 2.0 commerce backend for **RISITEX** — the B2B (with B2C) textile commerce portal for the **PIX** brand (innerwear / boxers / loungewear / pyjama). Targets **MBOs** (Multi-Brand Outlets) with tier-aware pricing (Local MBO / High-Footfall MBO / Regional Distributor).

This repo was created by transforming the Polemarch backend into RISITEX. The transformation is documented in [docs/migration-plan.md](./docs/migration-plan.md) (12 phases) and [docs/removed-modules.md](./docs/removed-modules.md) (Phase 2 purge log).

> **Status:** All phases of the original migration plan complete (Phase 2 purge, Phase 4 B2B onboarding, Phase 5 wallet, Phase 6 referral, Phase 7 commissions, Phase 8 ERPNext, Phase 9 logistics+backorder, Phase 10 matrix/MOQ/PO/credit, Phase 11 admin pages, Phases A-H storefront + auth + wallet + invoice flows). Subsequent Rounds 2–18 wired live data through every storefront page. The ERP architecture is in [docs/erp-architecture.md](./docs/erp-architecture.md); owner action items to finish ERP install are in [docs/erp-owner-actions.md](./docs/erp-owner-actions.md).

## Stack

- `@medusajs/framework`, `@medusajs/medusa` 2.15.x
- Postgres 16, Redis 7 (event bus + cache + workflow engine + locking + rate-limit store)
- Helmet + express-rate-limit (Redis-backed)
- Razorpay primary payment provider; Cashfree wallet provider (topup)
- ERPNext (Frappe) via `@risitex/medusa-plugin-erpnext` (workspace package)
- pdfkit for branded invoice PDFs

## Modules

**Active (Medusa modules):**
`company`, `customer_tier`, `cashfree_wallet`, `polemarch_communication` (Email/MSG91 SMS/Polygin WhatsApp/OTP), `polemarch_email_provider`, `file_storage`, `password_history`, `sales_performance` (sales rep + commission), `logistics` (transporter), `backorder`, `matrix_order`, `master_carton`, `purchase_order`, `credit_terms`, `saved_cart`, `marketing` (campaign), `polemarch` (audit substrate).

**Deferred:** `gamification` (kept on disk, post-MVP).

**Workspace packages:**
- `packages/medusa-plugin-erpnext` — generic Medusa↔ERPNext bridge (mapping engine + sync log + admin UI + retry/reconcile cron). Companion Frappe-side custom app `risitex_erp` lives on the bench (see [docs/erp-owner-actions.md](./docs/erp-owner-actions.md)).

**Removed:** see [docs/removed-modules.md](./docs/removed-modules.md).

## Run locally

```sh
# 1. Install deps (Node 20+, pnpm 9+).
pnpm install

# 2. Bring up Postgres + Redis docker containers (5435 / 16380).
# If you don't already have risitex-postgres + risitex-redis running:
#   docker run -d --name risitex-postgres -p 5435:5432 \
#     -e POSTGRES_USER=risitex -e POSTGRES_PASSWORD=risitex_dev_password_CHANGE_ME \
#     -e POSTGRES_DB=risitex_v2 postgres:16
#   docker run -d --name risitex-redis -p 16380:6379 redis:7

# 3. Configure env. Copy and edit:
cp .env.example .env
# Fill in JWT_SECRET / COOKIE_SECRET / AT_REST_ENCRYPTION_KEY / OTP_PEPPER
# (generate via:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# 4. Apply migrations.
pnpm exec medusa db:migrate

# 5. (Fresh install only) apply the Polemarch purge SQL.
docker exec -i risitex-postgres psql -U risitex -d risitex_v2 \
    < migrations/2026-06-15_polemarch-purge.sql

# 6. (Optional) seed a realistic PIX catalog + a region.
pnpm exec medusa exec ./src/scripts/seed-region.ts
pnpm exec medusa exec ./src/scripts/seed-pix-catalog.ts

# 7. Boot.
DEV_DEMO_OTP=123456 pnpm dev   # http://localhost:9000 (admin at /app)
```

### Dev OTP

`DEV_DEMO_OTP=123456` makes every email + WhatsApp OTP flow accept `123456` when SMTP / WhatsApp aren't configured. Required for local sign-up + verification testing.

### Default admin

After first boot, create an admin via `bench` or:

```sh
pnpm exec medusa user --email <you@example.com> --password <strong-password>
```

Recommended local-dev password: `Risitex2026` (dev-only, never use in prod).

## Required env

See [.env.example](./.env.example) for the full annotated list. Critical:

```
DATABASE_URL=postgresql://risitex:…@localhost:5435/risitex_v2
REDIS_URL=redis://localhost:16380
JWT_SECRET=…                    # 32+ random bytes
COOKIE_SECRET=…                 # 32+ random bytes
AT_REST_ENCRYPTION_KEY=…        # 32 bytes base64 — bank-account AES-256-GCM key
OTP_PEPPER=…                    # 32+ random bytes

STORE_CORS=http://localhost:3000
ADMIN_CORS=http://localhost:9000
AUTH_CORS=http://localhost:3000,http://localhost:9000

NEXT_PUBLIC_SITE_URL=http://localhost:3000   # for referral share URLs

# Razorpay (live mode optional in dev)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# ERPNext (post-Phase-8)
ERPNEXT_URL=http://localhost:8000
ERPNEXT_API_KEY=
ERPNEXT_API_SECRET=
ERPNEXT_WEBHOOK_SECRET=
```

## Scripts

- `pnpm dev` — `medusa develop` with hot reload.
- `pnpm build` / `pnpm start` — production build / start.
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm test` — Vitest suite (verification helpers, address validator, rate-limit, require-verified gate).
- `src/scripts/*.ts` — ops scripts. Run via `pnpm exec medusa exec ./src/scripts/<file>.ts`.

## Where things live

| Path | What |
|---|---|
| `src/api/store/` | Storefront API (orders, wallet, bank-accounts, saved-carts, purchase-orders, credit-terms, shipments, backorders, referral) |
| `src/api/admin/` | Admin API (companies, wallets, deposit-proofs, customer 360, sales-reps, commissions) |
| `src/api/webhooks/` | Provider webhooks (Cashfree, Razorpay, ERPNext-inbound) |
| `src/api/middlewares.ts` | Auth + verification gate + rate-limit + helmet + audit |
| `src/modules/*/` | Medusa modules (model + service + migrations) |
| `src/admin/routes/` | Custom admin pages (Companies, Tiers, Wallets, Customer 360 widget, ERPNext, etc.) |
| `src/subscribers/` | Domain event handlers (order-placed-wallet-debit, ERPNext push, …) |
| `src/jobs/` | Scheduled jobs (ERPNext pull, reconciliation, retry-events) |
| `src/utils/` | `require-verified.ts` gate, `account-lockout.ts`, `password-policy.ts`, `document-pipeline.ts` |
| `packages/medusa-plugin-erpnext/` | Workspace ERPNext bridge plugin |
| `docs/migration-plan.md` | Original 12-phase plan (historical) |
| `docs/erp-architecture.md` | ERPNext source-of-truth split + 7 RISITEX custom doctypes |
| `docs/erp-owner-actions.md` | Step-by-step install/configure for ERPNext integration |
| `tests/` + `**/__tests__/` | Vitest unit tests |

## Companion storefront

The Next.js 15 storefront lives at `D:\Users\KillerKoli\Desktop\risitex\apps\storefront` (separate repo). It points at this backend via `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000`.

To run end-to-end:

```sh
# Terminal 1 — backend
cd D:\Users\KillerKoli\Desktop\risitex-v2
DEV_DEMO_OTP=123456 pnpm dev

# Terminal 2 — storefront
cd D:\Users\KillerKoli\Desktop\risitex\apps\storefront
pnpm dev
```

Then visit `http://localhost:3000`.
