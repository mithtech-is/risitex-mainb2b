# RISITEX Migration Plan — Polemarch → RISITEX

**Source baseline:** `D:\polemarch-all-main\apps\medusa-backend` (production, securities/equity-focused)
**Target workspace:** `D:\risitex-v2\` (this repo, freshly copied from Polemarch)
**Source of truth:** `D:\Users\KillerKoli\Downloads\pix-functional-requirements (1).docx` (FR-1.01 → FR-10.02)
**Auxiliary baseline:** `D:\risitex\` (the current B2C scaffold; only port deltas, see Phase 11)

Polemarch is not an agriculture platform as the prompt hinted — it is an **equity/securities trading portal** (Calcula = ISIN/company metadata, share_transfer = depository BOID transfers, customer_identity = ISO-week client IDs, Aadhaar/PAN/CMR/Demat = SEBI-mandated KYC, IFSC = NEFT/RTGS). All of that goes.

What we are building: a B2B (with B2C exposure) textile commerce portal for the **PIX** brand (innerwear/boxers/loungewear/pyjama) targeting **MBOs** (Multi-Brand Outlets). Three tiers: Local MBO, High-Footfall MBO, Regional Distributor.

---

## 1. Module Inventory

### 1.1 Polemarch `src/modules/` — classification

| Module | Tables | Verdict | Rationale & action |
|---|---:|---|---|
| `cashfree_wallet` | 4 (+38 migrations) | **KEEP** | Mature wallet ledger, idempotent credit/debit, optimistic CAS retries. Powers FR-7.02/03 referral wallet. Rename audit-only fields (none) but keep the data plane. |
| `cashfree_wallet_provider` | — | **KEEP** | Medusa payment provider exposing wallet as a tender. Keep. |
| `polemarch_communication` | 12 | **KEEP** as `notification` | SMTP / MSG91 SMS / Polygin WhatsApp / phone OTP. Satisfies FR-5.x notifications and user-list WhatsApp/Email/SMS. Rename namespace to `notification` for clarity. |
| `polemarch_email_provider` | — | **KEEP** | Medusa notification provider wrapper around `polemarch_communication`. Keep. |
| `polemarch` | 2 (Notification, JobRun) | **KEEP** as `audit` | File-proxy + JobRun ledger = audit substrate. Rename module to `audit`; drop file-proxy if duplicate with `file_storage`. |
| `file_storage` + `file_storage_provider` | 2 | **KEEP** | Pluggable backend (local/S3/R2/MinIO/Wasabi). Used by deposit-proof uploads, product imagery (FR-2.01 HD assets). |
| `gamification` | 13 | **MERGE → `loyalty`** | Points/streaks/achievements are useful for B2B retention. Strip equity-specific event types; keep ledger/leaderboard. Lower priority — Phase 10. |
| `password_history` | 2 | **KEEP** | Compliance/audit hygiene. No changes. |
| `online_visibility_optimization` (OVO) | 1 + content engine deps | **REMOVE** | User listed REMOVE explicitly. SEO/keyword/competitor tracking is out of MVP scope. |
| `polemarch_content` | 11 (+13 migrations) | **DEFER** | Editorial engine (articles, glossary, comparisons). Not MVP but valuable for FR-2.03 PDP content / brand storytelling. Leave dormant; revisit Phase 12+. |
| `price_alerts` | 1 | **REMOVE** | Equity price-alert feature; irrelevant for B2B textile. |
| `watchlist` | 2 | **REMOVE** | Equity watchlist. Irrelevant. |
| `calcula` | 1 | **REMOVE** | ISIN/equity metadata + price sync from Calcula API. Pure securities. |
| `customer_identity` | 2 | **REMOVE** | ISO-week client IDs and Aadhaar/PAN registry for SEBI KYC. Replaced by RISITEX `company` module (GSTIN-based). |
| `share_transfer` | 1 | **REMOVE** | 4-step depository BOID transfer pipeline. Pure securities. |

### 1.2 New RISITEX modules to create

Per merging rules in the prompt:

| Module | Merged from prompt list | Purpose | Phase |
|---|---|---|---|
| **`company`** | Company + Customer Tier (partial) | GSTIN-bound B2B account; Pending/Approved/Suspended; binds Medusa customer(s); FR-1.02 | 4 |
| **`customer_tier`** | Customer Tier | Local MBO / High-Footfall MBO / Regional Distributor; drives pricing (FR-1.03, FR-4.01) | 4 |
| **`growth`** | Affiliate + Referral | Affiliate registration, referral code generation, attribution, payout ledger (FR-7.x) | 6 |
| **`sales_performance`** | Commission + Sales Rep | Rep↔MBO mapping (FR-8.01), perpetual attribution (FR-8.02), variable commission (FR-8.03/04), ERPNext sync (FR-8.05) | 7 |
| **`tier_pricing`** | Pricing | Tier-aware pricing on top of Medusa native `pricing` module; price lists per tier (FR-4.01) | 4 |
| **`campaign`** | Campaign | Code→campaign mapping, GARTEX2026 tracking (FR-6.02), attribution ledger | 10 |
| **`matrix_order`** | Matrix Ordering | Size grid (S/M/L/XL/XXL) cart line composition; FR-3.01 | 10 |
| **`master_carton`** | Master Carton | Predefined SKU+size ratios (30u/60u); FR-3.02 | 10 |
| **`quick_reorder`** | Quick Reorder | Cart-from-past-invoice; FR-3.04 | 10 |
| **`purchase_order`** | Purchase Order | PO number capture at checkout, PDF, Net-30 invoice; FR-4.03 | 10 |
| **`credit_terms`** | Credit Terms | Account credit limits, payment-terms enum (advance / Net-30), per-MBO override | 10 |
| **`erpnext_sync`** | ERPNext | Wraps existing `@polemarch/medusa-plugin-erpnext`; renamed namespace; adds Delivery Note + commission payload | 8 |
| **`logistics`** | Shipment | Transporter assignment (Porter/VRL/SRMT), vehicle no., dispatch state machine; FR-10.01/02 | 9 |
| **`backorder`** | Backorders (implicit) | Backorder line items with ETA; FR-9.03; Jira ticket trigger (FR-5.03) | 9 |
| **`integration_jira`** | Jira (integration) | Webhook → Jira REST; backorder/packaging tickets; FR-5.03 | 9 |

Medusa-native modules (`product`, `inventory`, `stock-location`, `order`, `cart`, `payment`, `promotion`, `pricing`, `customer`, `region`, `tax`) are **inherited unchanged** and configured for INR + India + GST.

### 1.3 `src/api/` — route disposition

| Route | Verdict | Action |
|---|---|---|
| `store/account`, `store/me`, `store/orders`, `store/products`, `store/checkout`, `store/fees`, `store/wallet`, `store/referral`, `store/notifications`, `store/contact`, `store/newsletter`, `store/upload` | KEEP | Adapt internals only. |
| `store/activity`, `store/marketplace-products`, `store/stats` | ADAPT | Rename / restructure for B2B dashboard semantics. |
| `store/auth` | ADAPT | Add GSTIN field, "Pending Approval" gating (FR-1.02). |
| `store/gamification` | DEFER | Behind feature flag; not MVP. |
| `store/ai`, `store/content` | DEFER | Editorial engine deferred. |
| `store/ovo`, `store/online-visibility-optimization`, `store/calcula`, `store/share-popularity`, `store/price-alerts`, `store/watchlist`, `store/bank-accounts`, `store/demat-accounts`, `store/ifsc`, `store/kyc`, `store/company-requests` | REMOVE | Out-of-scope or replaced. (`company-requests` becomes `/store/companies/apply` under new module.) |
| **NEW**: `store/companies/apply`, `store/companies/me`, `store/tier-pricing/quote`, `store/cart/matrix`, `store/cart/master-carton`, `store/cart/quick-reorder`, `store/checkout/purchase-order`, `store/affiliate/referrals`, `store/affiliate/dashboard`, `store/shipments/{id}/track`, `store/backorders` | CREATE | Phase-tagged in §3. |
| `admin/cashfree-products`, `admin/cashfree-settings`, `admin/communication`, `admin/contact-submissions`, `admin/customers`, `admin/dev`, `admin/email`, `admin/fees`, `admin/file-storage`, `admin/held-orders`, `admin/job-health`, `admin/media`, `admin/newsletter-subscriptions`, `admin/orders`, `admin/posthog-status`, `admin/products`, `admin/referrals`, `admin/upload`, `admin/wallets`, `admin/webhook-events` | KEEP | Adapt content where needed. |
| `admin/account-requests`, `admin/company-requests` | MERGE | Into `admin/companies/{id}/approve` under new B2B flow. |
| `admin/calcula`, `admin/aadhaar-records`, `admin/pan-records`, `admin/cmr-records`, `admin/bank-accounts`, `admin/bank-records`, `admin/customer-client-id`, `admin/demat-accounts`, `admin/deposit-proofs`, `admin/identity-registry`, `admin/kyc-overview`, `admin/manual-kyc-queues`, `admin/manual-kyc-requests`, `admin/ovo`, `admin/secure-id-verifications`, `admin/share-transfers`, `admin/gamification` (defer) | REMOVE / DEFER | See verdict. |
| **NEW**: `admin/companies`, `admin/customer-tiers`, `admin/sales-reps`, `admin/sales-reps/{id}/assignments`, `admin/commissions`, `admin/campaigns`, `admin/credit-terms`, `admin/master-cartons`, `admin/affiliates`, `admin/affiliates/{id}/payouts`, `admin/shipments/transporter-assign`, `admin/erpnext/sync-status` | CREATE | |

### 1.4 `src/subscribers/` — verdicts

| File | Verdict | Notes |
|---|---|---|
| `customer-welcome.ts`, `password-reset.ts`, `notification-handler.ts`, `referral-reward.ts`, `product-revalidate.ts` | KEEP / ADAPT | `referral-reward` is the seed of the Growth module — extend, don't rewrite. |
| `aml-flag-order.ts` | ADAPT or REMOVE | AML scoring was for securities. Keep as a generic fraud hook OR drop. → **DROP** for MVP. |
| `gamification-order.ts` | DEFER | Behind flag. |
| `content-*` (6 files), `ai-budget-exceeded.ts`, `internal-link-inserted.ts` | DEFER | Editorial engine deferred. |
| `calcula-*` (3 files), `customer-client-id.ts`, `share-transfer-*` (3 files) | REMOVE | |
| **NEW**: `company-approved.ts`, `order-placed-erpnext.ts`, `order-placed-commission.ts`, `order-placed-campaign-attribution.ts`, `order-cancelled-erpnext.ts`, `order-shipped-erpnext.ts`, `backorder-created-jira.ts`, `referral-first-order.ts` | CREATE | |

### 1.5 `src/jobs/` — verdicts

| Job | Verdict |
|---|---|
| `cart-abandoned-emails.ts` | **KEEP** |
| `vba-reconcile-payments.ts` | **REMOVE** (Cashfree virtual-account payins; not used in RISITEX scope) |
| `kyc-pending-reminder.ts` | **REMOVE** |
| `sync-calcula-snapshots.ts` | **REMOVE** |
| `ai-*` (3 files), `content-regenerate-stale.ts`, `embedding-backfill.ts`, `internal-link-rescore.ts`, `keyword-*` (2 files), `seo-*` (2 files), `url-index-daily.ts` | **DEFER** (editorial engine) |
| `gamification-recompute-leaderboards.ts` | **DEFER** |
| **NEW**: `erpnext-inventory-poll.ts` (FR-9.01), `erpnext-orphan-reconcile.ts`, `commission-monthly-payout.ts`, `backorder-eta-refresh.ts` | CREATE |

### 1.6 `src/admin/routes/` — admin extensions

| Route | Verdict |
|---|---|
| `bulk-editor`, `cashfree`, `communication`, `customer-360`, `email`, `fees`, `file-storage`, `inbox`, `media`, `posthog-status`, `referral`, `wallets` | KEEP / ADAPT |
| `content` | DEFER |
| `gamification` | DEFER |
| `aadhaar-records`, `bank-records`, `cmr-records`, `identity-registry`, `manual-kyc`, `ovo1`, `pan-records` | REMOVE |
| **NEW**: `companies` (approve queue), `customer-tiers`, `sales-reps`, `commissions`, `campaigns`, `master-cartons`, `credit-terms`, `affiliates`, `shipments`, `erpnext-sync`, `audit-log` | CREATE |

### 1.7 Plugins & Integrations

| Item | Verdict |
|---|---|
| `@polemarch/medusa-plugin-erpnext` (workspace plugin) | **KEEP & RENAME** → `@risitex/medusa-plugin-erpnext`. Polemarch's webhook reconciliation, retry, queue, scheduler all reusable. |
| Cashfree (wallet + provider) | KEEP for wallet. **Add** Razorpay as the **primary** payment provider (FR-4.03 mandates Razorpay). |
| MSG91 (SMS), Polygin (WhatsApp), SMTP (Email) | KEEP (via polemarch_communication → renamed). |
| PostHog (analytics) | KEEP. |
| **NEW**: Razorpay payment provider, Porter API client, VRL/SRMT trackers, Jira REST client | CREATE |

---

## 2. Database Schema Diff

### 2.1 Tables reused (KEEP — no schema change)

```
cashfree_wallet, cashfree_wallet_transaction, cashfree_wallet_setting,
cashfree_wallet_inflight,   -- + 38 migrations applied as-is
storage_setting,
polemarch_notification → renamed audit_event,
polemarch_job_run → renamed audit_job_run,
polemarch_communication_template, polemarch_communication_log,
polemarch_communication_otp, polemarch_communication_channel_config,
password_history,
gamification_* (13 tables; deferred but kept dormant)
```

### 2.2 Tables removed (`DROP TABLE` migrations to author)

```
-- Calcula
calcula_company_record
-- Customer identity (SEBI KYC)
customer_client_id, identity_registry
-- Share transfers
share_transfer_status
-- Price alerts / watchlist
price_alert, watchlist, watchlist_item
-- OVO
ovo_setting
-- Bank/IFSC/Aadhaar/PAN/CMR/Demat tables (likely all in customer_identity or separate)
aadhaar_record, pan_record, cmr_record, bank_record, demat_account
```

(Exact table names confirmed in Phase 3 against the live snapshot.)

### 2.3 Tables modified

```
customer:
  + company_id NULL FK → company.id          -- PIX is B2B; nullable for B2C path
  + sales_rep_id NULL FK → sales_rep.id      -- FR-8.01
  + customer_tier_id NULL FK → customer_tier.id -- FR-1.03
  + payment_terms TEXT NULL                  -- 'advance_100' | 'net_30' | 'net_60'
  - kyc_*, aadhaar_*, client_id columns (drop)

order:
  + sales_rep_id_attributed NULL              -- FR-8.02 perpetual attribution snapshot
  + purchase_order_id NULL FK → purchase_order.id
  + campaign_id NULL FK → campaign.id         -- FR-6.02
  + matrix_order_id NULL FK → matrix_order_session.id

product / product_variant:
  + gst_hsn_code TEXT NULL                    -- FR-4.02
  + master_carton_id NULL FK → master_carton.id -- via metadata or link table
```

### 2.4 Tables merged

```
account_request + company_request → company_application
  (single intake for B2B onboarding; status enum pending/approved/rejected/suspended)
```

### 2.5 New tables (Phase 4-10)

```
company (id, gstin, trade_name, billing_address, status, tier_id, credit_terms_id, created_by_admin, ...)
company_application (raw payload; status; review notes)
customer_tier (id, code, name, priority, default_payment_terms)
tier_price_list (link customer_tier ↔ price_list)
sales_rep (id, employee_id, name, email, phone, active)
sales_rep_assignment (sales_rep_id, customer_id|company_id, assigned_at, valid_until)
commission_rule (id, scope enum {first_order, restock, custom}, percent, margin_basis bool, ...)
commission_record (id, order_id, sales_rep_id, rule_id, amount_minor, margin_basis_amount, status, paid_at)
campaign (id, code, name, source, starts_at, ends_at, target_metric, ...)
campaign_attribution (id, campaign_id, order_id, customer_id, code, captured_at)
affiliate (id, customer_id?, code, display_name, default_commission_percent, ...)
affiliate_referral (id, affiliate_id, referred_customer_id, status, first_order_at, ip_hash, ...)
affiliate_payout (id, affiliate_id, amount_minor, currency, status, period_start, period_end)
master_carton (id, name, total_units, size_ratio jsonb, sku_template, active)
master_carton_line (master_carton_id, sku, qty)
matrix_order_session (id, cart_id, product_id, grid jsonb)
quick_reorder_template (id, customer_id, name, source_order_id, created_at)
purchase_order (id, customer_id, po_number, file_url, value_minor, expected_payment_date)
credit_terms (id, code, days, advance_pct, max_outstanding_minor)
shipment_transporter (shipment_id, transporter_code, vehicle_number, awb, dispatched_at)
backorder_request (id, order_id, line_id, sku, qty, eta, jira_ticket_id)
jira_ticket_link (entity_type, entity_id, jira_issue_key, status, last_synced_at)
erpnext_sync_log (id, entity_type, entity_id, direction, status, error, payload, attempted_at)
```

### 2.6 Migration scripts

Each Phase produces SQL migrations under `migrations/*.sql` and module-level Medusa migrations under `src/modules/<m>/migrations/`. The Phase 3 deliverable includes a single guarded `2026-06-XX_polemarch-purge.sql` for table drops (idempotent: `DROP TABLE IF EXISTS ... CASCADE`).

---

## 3. Phase-by-Phase Plan

> Each phase below lists: **Files Reused / Modified / Removed / Created · DB Changes · API Changes · Migrations · Frontend Impact · Tests**.

### Phase 1 — Polemarch Analysis  (DONE — this document)

- Files Reused: n/a
- Files Modified: n/a
- Files Removed: n/a
- Files Created: `docs/migration-plan.md` (this file)
- DB Changes: none
- API Changes: none
- Migration Scripts: none
- Frontend Impact: none
- Tests: review by Manoj

### Phase 2 — Module Cleanup  (THIS TURN, after plan approval)

- **Files Reused:** all generic Medusa pipeline files
- **Files Modified:** `medusa-config.ts` (drop module entries), `package.json` (drop dead deps), `.env.example`
- **Files Removed:**
  - `src/modules/calcula/`, `src/modules/customer_identity/`, `src/modules/share_transfer/`, `src/modules/online_visibility_optimization/`, `src/modules/price_alerts/`, `src/modules/watchlist/`
  - `src/api/store/{calcula,share-popularity,ovo,online-visibility-optimization,price-alerts,watchlist,bank-accounts,demat-accounts,ifsc,kyc}/`
  - `src/api/admin/{calcula,aadhaar-records,bank-accounts,bank-records,cmr-records,customer-client-id,demat-accounts,deposit-proofs,identity-registry,kyc-overview,manual-kyc-queues,manual-kyc-requests,ovo,pan-records,secure-id-verifications,share-transfers}/`
  - `src/admin/routes/{aadhaar-records,bank-records,cmr-records,identity-registry,manual-kyc,ovo1,pan-records}/`
  - Subscribers: `calcula-*.ts`, `customer-client-id.ts`, `share-transfer-*.ts`, `aml-flag-order.ts`
  - Jobs: `kyc-pending-reminder.ts`, `sync-calcula-snapshots.ts`, `vba-reconcile-payments.ts`
- **Files Created:** `docs/removed-modules.md` (rationale + recovery checklist)
- **DB Changes:** none yet (tables stay until Phase 3 — code-only purge first so we never block on data)
- **API Changes:** routes above disappear (404)
- **Migration Scripts:** none
- **Frontend Impact:** Polemarch admin pages tied to the removed routes vanish; no storefront yet
- **Tests:** `pnpm typecheck`, `pnpm dev` boots cleanly, `curl /health` 200
- **Exit gate:** USER REVIEW

### Phase 3 — Database Migration

- Files Modified: `medusa-config.ts` (DB URL stays; no schema config changes)
- Files Created: `migrations/2026-06-XX_polemarch-purge.sql` (DROP TABLE IF EXISTS for §2.2), `src/scripts/preflight-purge-check.ts` (counts orphan FKs)
- DB Changes: drop tables in §2.2
- API Changes: none
- Migration Scripts: `pnpm medusa db:migrate`
- Frontend Impact: none
- Tests: preflight script reports zero blockers; migration runs idempotently against a snapshot of current Polemarch DB

### Phase 4 — Core Commerce (Company, Tier, Pricing, Auth)

- Files Created:
  - `src/modules/company/{index.ts,service.ts,models/company.ts,models/company-application.ts,migrations/*}`
  - `src/modules/customer_tier/{index.ts,service.ts,models/customer-tier.ts,models/tier-price-list.ts,migrations/*}`
  - `src/modules/tier_pricing/{index.ts,service.ts,index resolver}`
  - `src/api/store/companies/apply/route.ts`, `src/api/store/companies/me/route.ts`
  - `src/api/admin/companies/route.ts`, `src/api/admin/companies/[id]/route.ts`, `.../[id]/approve/route.ts`, `.../[id]/suspend/route.ts`
  - `src/api/admin/customer-tiers/route.ts` (CRUD)
  - `src/admin/routes/companies/page.tsx` (approval queue)
  - `src/admin/routes/customer-tiers/page.tsx`
- Files Modified: `src/api/store/auth/*` — accept `gstin`, `trade_name`, persist via `company_application`; status `pending` until admin approves
- DB Changes: new tables `company`, `company_application`, `customer_tier`, `tier_price_list`; `customer` gets `company_id`, `customer_tier_id`, `payment_terms`
- API Changes: see above
- Migration Scripts: module migrations + new SQL
- Frontend Impact: Storefront `sign-up` form gets GSTIN/trade-name; "Pending Approval" page; PDP price changes per tier (FR-1.01, FR-1.03, FR-4.01)
- Tests: unit (tier resolution, status transitions); integration (apply → admin approve → login → tier-aware price quote)

### Phase 5 — Wallet  (light pass — Polemarch's cashfree_wallet is largely ready)

- Files Reused: entire `src/modules/cashfree_wallet/` and its 38 migrations
- Files Modified:
  - `src/api/store/wallet/balance/route.ts`, `.../apply/route.ts`, `.../clear/route.ts` (gate on B2B status; keep B2C path)
  - `src/admin/routes/wallets/page.tsx` (port the wallet-console search UX from `D:\risitex\` — delta worth porting)
- Files Created:
  - `src/subscribers/order-placed-wallet-debit.ts` (port from `D:\risitex\` with the `query.graph` totals fix)
  - `src/subscribers/order-cancelled-wallet-reverse.ts`
- DB Changes: none
- API Changes: add `/store/wallet/balance`, `/store/wallet/apply`, `/store/wallet/clear`, `/admin/wallets/{id}/credit`, `/admin/wallets/{id}/debit`, `/admin/wallets/{id}/freeze`
- Migration Scripts: none (cashfree_wallet migrations already in place)
- Frontend Impact: checkout wallet split UI (B2B context)
- Tests: e2e — credit then apply at checkout debits; cancel reverses

### Phase 6 — Referrals & Affiliate (Growth module)

- Files Reused: `src/api/store/referral/route.ts`, `src/api/admin/referrals/*`, `src/subscribers/referral-reward.ts`, `src/admin/routes/referral/`
- Files Modified:
  - `src/subscribers/referral-reward.ts` → split into `referral-first-order.ts`; uses `query.graph` for totals; auto-creates `commission_rule` per affiliate (port pattern from `D:\risitex\`)
  - referral-reward threshold becomes ₹5,000 default per FR-7.02 (configurable)
- Files Created:
  - `src/modules/growth/{index.ts,service.ts,models/affiliate.ts,models/affiliate-referral.ts,models/affiliate-payout.ts,migrations/*}`
  - `src/api/store/affiliate/register/route.ts`, `.../dashboard/route.ts`, `.../referrals/route.ts`
  - `src/api/admin/affiliates/route.ts`, `.../[id]/payouts/route.ts`, `.../[id]/approve/route.ts`
  - `src/admin/routes/affiliates/page.tsx`
- DB Changes: `affiliate`, `affiliate_referral`, `affiliate_payout`
- API Changes: see above
- Migration Scripts: module migrations
- Frontend Impact: affiliate dashboard (FR-7.04), referral landing `?ref=CODE` capture, sign-up attach
- Tests: e2e — affiliate code → referred sign-up → first order → ₹5,000 wallet credit + commission record paid

### Phase 7 — Commissions & Sales Reps (Sales Performance module)

- Files Created:
  - `src/modules/sales_performance/{index.ts,service.ts,models/sales-rep.ts,models/sales-rep-assignment.ts,models/commission-rule.ts,models/commission-record.ts,migrations/*}`
  - `src/api/store/orders/[id]/impersonate/route.ts` (FR-1.04)
  - `src/api/admin/sales-reps/route.ts`, `.../assignments/route.ts`, `.../commissions/route.ts`
  - `src/subscribers/order-placed-commission.ts` (variable rate FR-8.03; margin basis FR-8.04)
  - `src/admin/routes/sales-reps/page.tsx`, `src/admin/routes/commissions/page.tsx`
- DB Changes: `sales_rep`, `sales_rep_assignment`, `commission_rule`, `commission_record`; `order.sales_rep_id_attributed` (snapshot of mapping at order time = perpetual attribution per FR-8.02)
- Migration Scripts: module migrations
- Frontend Impact: rep-impersonation banner in storefront when `actor_type=rep`; rep dashboard
- Tests: integration — assign rep → MBO self-orders → commission attributed to rep; impersonated cart also attributes

### Phase 8 — ERPNext

- Files Reused: `packages/medusa-plugin-erpnext` (entire) — webhook reconciliation, retry, queue, scheduler
- Files Modified:
  - Rename plugin namespace `@polemarch/...` → `@risitex/...` in `package.json` and `pnpm-workspace.yaml`
  - Add Delivery Note doctype handler (FR-10.01)
  - Add commission append-to-Sales-Order (FR-8.05)
- Files Created:
  - `src/modules/erpnext_sync/{index.ts,service.ts,migrations/erpnext_sync_log.ts}`
  - `src/subscribers/order-placed-erpnext.ts`, `order-cancelled-erpnext.ts`, `order-shipped-erpnext.ts`
  - `src/jobs/erpnext-inventory-poll.ts` (FR-9.01 — polls Stock Balance for Finished Goods warehouse only per FR-9.04)
  - `src/jobs/erpnext-orphan-reconcile.ts`
- DB Changes: `erpnext_sync_log`
- Migration Scripts: module migration
- Frontend Impact: storefront stock indicator shows Available Qty (FR-9.02)
- Tests: smoke — sandbox ERPNext, post a Sales Order, verify reflected in Medusa; poll inventory; cancel reflects

### Phase 9 — Inventory & Logistics

- Files Created:
  - `src/modules/logistics/{index.ts,service.ts,models/shipment-transporter.ts,migrations/*}`
  - `src/modules/backorder/{index.ts,service.ts,models/backorder-request.ts,migrations/*}`
  - `src/modules/integration_jira/{index.ts,service.ts,client.ts}`
  - `src/api/admin/shipments/[id]/transporter/route.ts`
  - `src/api/store/shipments/[id]/track/route.ts`, `src/api/store/backorders/route.ts`
  - `src/subscribers/order-placed-backorder-jira.ts`, `src/subscribers/shipment-dispatched-erpnext.ts`
  - `src/lib/porter/client.ts` (Porter REST client), `src/lib/vrl/client.ts`, `src/lib/srmt/client.ts`
  - `src/admin/routes/shipments/page.tsx`
- DB Changes: `shipment_transporter`, `backorder_request`, `jira_ticket_link`
- Migration Scripts: module migrations
- Frontend Impact: MBO dashboard shows transporter + vehicle (FR-10.02), live tracking widget (FR-5.02)
- Tests: stub Porter; integration backorder → Jira ticket creation; warehouse marks dispatched → Delivery Note in ERPNext

### Phase 10 — Wholesale Features (Matrix, Master Carton, Quick Reorder, PO, Credit Terms, Campaign, Discount)

- Files Created:
  - `src/modules/matrix_order/{index.ts,service.ts,models/matrix-order-session.ts}`
  - `src/modules/master_carton/{index.ts,service.ts,models/master-carton.ts,models/master-carton-line.ts}`
  - `src/modules/quick_reorder/{index.ts,service.ts,models/quick-reorder-template.ts}`
  - `src/modules/purchase_order/{index.ts,service.ts,models/purchase-order.ts}`
  - `src/modules/credit_terms/{index.ts,service.ts,models/credit-terms.ts}`
  - `src/modules/campaign/{index.ts,service.ts,models/campaign.ts,models/campaign-attribution.ts}`
  - `src/api/store/cart/matrix/route.ts`, `src/api/store/cart/master-carton/route.ts`, `src/api/store/cart/quick-reorder/route.ts`
  - `src/api/store/checkout/purchase-order/route.ts` (PO upload)
  - `src/api/admin/master-cartons/*`, `src/api/admin/campaigns/*`, `src/api/admin/credit-terms/*`
  - Cart workflow extensions: MOQ validator (FR-3.03) blocks complete-cart < 60 units; auto-discount validator (FR-6.03); stacking exclusivity (FR-6.04)
  - `src/admin/routes/master-cartons/page.tsx`, `.../campaigns/page.tsx`, `.../credit-terms/page.tsx`
- DB Changes: `matrix_order_session`, `master_carton(+_line)`, `quick_reorder_template`, `purchase_order`, `credit_terms`, `campaign(+_attribution)`
- API Changes: see above
- Migration Scripts: per-module migrations
- Frontend Impact: matrix UI on PDP, master-carton single-click button, quick reorder dashboard, PO field at checkout, campaign code field, automatic cart discount line
- Tests: e2e — matrix order, MOQ blocked under 60, master carton single-click, GARTEX2026 attribution, Net-30 PO path

### Phase 11 — Frontend Integration

- Files Reused: port the `D:\risitex\apps\storefront\` Next.js 15 scaffold (Topnav, container, theme tokens, megamenu, search palette, checkout page shell, wallet UI components)
- Files Modified: replace fixtures with real `/store/products`, `/store/companies/me`, `/store/tier-pricing/quote`, etc.
- Files Created: `apps/storefront/src/features/{matrix,master-carton,quick-reorder,affiliate,sales-rep,po-checkout,tier-pricing}/...`
- DB Changes: none
- API Changes: thin Next.js route handlers proxying Medusa where SDK doesn't suffice
- Migration Scripts: none
- Frontend Impact: complete B2B portal flows
- Tests: Playwright e2e for the golden paths (apply→approve→login→matrix order→checkout→track)

### Phase 12 — Testing

- Files Created:
  - `tests/integration/{company-onboarding,tier-pricing,matrix-order,master-carton,moq,referral,commission,erpnext-sync,backorder,po-checkout,credit-terms}.spec.ts`
  - `tests/e2e/{b2b-golden-path,b2c-golden-path,rep-impersonation,affiliate-dashboard}.spec.ts`
  - `tests/load/{checkout-burst,inventory-poll}.k6.js`
- API Changes: none
- Frontend Impact: none
- Tests: own deliverable
- Exit gate: green CI

---

## 4. Frontend API Contract Summary (for FR consumption)

| FR | Endpoint | Module |
|---|---|---|
| FR-1.02 register | `POST /store/companies/apply` | company |
| FR-1.03 tier visibility | `GET /store/companies/me` | company |
| FR-1.04 rep impersonate | `POST /admin/sales-reps/{id}/impersonate` → cookie/token | sales_performance |
| FR-2.x products | `GET /store/products?...` (Medusa native) | product |
| FR-3.01 matrix | `POST /store/cart/matrix` `{cart_id, product_id, grid:{S:n,M:n,...}}` | matrix_order |
| FR-3.02 master carton | `POST /store/cart/master-carton` `{cart_id, master_carton_id, qty}` | master_carton |
| FR-3.03 MOQ | enforced in `complete-cart` workflow | matrix_order |
| FR-3.04 quick reorder | `POST /store/cart/quick-reorder` `{from_order_id \| template_id}` | quick_reorder |
| FR-4.01 tier price | `POST /store/tier-pricing/quote` `{cart_id}` → `{lines:[{id, unit_minor}]}` | tier_pricing |
| FR-4.02 GST | `POST /store/checkout/calculate-tax` (Medusa native + India HSN rules) | tax + tier_pricing |
| FR-4.03 PO | `POST /store/checkout/purchase-order` `{cart_id, po_number, file}` | purchase_order |
| FR-5.01 ERPNext | subscriber on `order.placed` | erpnext_sync |
| FR-5.02 tracking | `GET /store/shipments/{id}/track` | logistics |
| FR-5.03 Jira | subscriber on `order.placed` (if backordered) | integration_jira |
| FR-6.x promotions | Medusa native `/store/promotions/validate` + extensions | campaign |
| FR-7.01 referral code | `POST /store/affiliate/referrals` | growth |
| FR-7.02 reward | subscriber `referral-first-order` → wallet credit | growth + cashfree_wallet |
| FR-7.03 wallet apply | `POST /store/wallet/apply` | cashfree_wallet |
| FR-7.04 affiliate dashboard | `GET /store/affiliate/dashboard` | growth |
| FR-8.x commission | subscriber + `GET /admin/commissions` | sales_performance |
| FR-9.01 stock | `GET /store/products` enriched from ERPNext poll | erpnext_sync |
| FR-9.03 backorder | `POST /store/backorders` | backorder |
| FR-10.01 delivery note | subscriber `shipment-dispatched-erpnext` | logistics + erpnext_sync |
| FR-10.02 transporter | `GET /store/shipments/{id}/track` returns transporter + vehicle | logistics |

---

## 5. Risks & Open Questions

1. **Razorpay vs Cashfree** — FR-4.03 mandates Razorpay for advance; Polemarch is wired for Cashfree wallet+payment. Need a Razorpay key pair to start Phase 5 testing. Cashfree stays for wallet ONLY.
2. **ERPNext sandbox** — Phase 8 needs a Frappe URL + API key/secret. Confirm whether `polemarch-erpnext` test instance is reusable for RISITEX.
3. **Polemarch DB snapshot reuse** — Phase 3 drop migrations assume we are NOT importing Polemarch production data. Confirm RISITEX starts on a fresh DB; otherwise add data-migration steps.
4. **PIX vs RISITEX naming** — Spec consistently says "PIX" for the brand. Should storefront copy, product titles, email templates reference PIX, RISITEX, or both? Confirms scope of Phase 11 design copy.
5. **GST HSN per SKU** — needed for FR-4.02. Confirm HSN codes will arrive on the product import (ERPNext canonical) or need manual capture.
6. **Net-30 invoicing engine** — does ERPNext generate the Net-30 invoice with auto-reminders, or do we wrap that in our own credit_terms module too?
7. **Polemarch in-flight features** — `polemarch_content` and `gamification` are mature but deferred; confirm OK to leave dormant (no admin nav links) until post-MVP.
8. **`aml-flag-order.ts` removal** — Polemarch hooks AML risk-scoring on `order.placed`. If RISITEX wants any fraud signal, build a thin replacement in Phase 7; else drop.

---

## 6. Order-of-execution checklist for this turn

After plan approval:
- [ ] Phase 2 — delete the modules / routes / subscribers / jobs / admin pages listed in §3 Phase 2
- [ ] Update `medusa-config.ts` to drop the dead module registrations
- [ ] Verify `pnpm typecheck` + boot of `pnpm dev`
- [ ] First commit on local-only `main` (no GitHub push — see memory `project_github_deferred`)
- [ ] **STOP for user review**

Phase 3+ executes only after Manoj green-lights Phase 2.
