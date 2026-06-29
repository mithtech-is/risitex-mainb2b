# Phase 2 — Polemarch purge log

This file records every Polemarch artifact removed during the Polemarch → RISITEX Phase 2 cleanup. The rationale for each group is documented in [migration-plan.md](./migration-plan.md) §1.

Code-only purge — **no database tables were dropped in this phase**. DROP TABLE migrations are authored in Phase 3 once the storeroom is empty.

## Recovery

Anything below can be recovered by copying from the Polemarch reference checkout at `D:\Users\KillerKoli\Desktop\polemarch-all-main\apps\medusa-backend\`.

## Modules removed (`src/modules/`)

| Module | Domain |
|---|---|
| `calcula` | Equity / ISIN / company metadata sync from Calcula API |
| `customer_identity` | ISO-week-based client IDs + Aadhaar/PAN registry for SEBI KYC |
| `share_transfer` | Depository BOID transfer pipeline (4-step electronic securities fulfillment) |
| `online_visibility_optimization` (OVO) | SEO/GEO/AEO/LLMO/KGO/REO settings singleton |
| `polemarch_content` | Editorial engine (article/news/glossary/comparison/valuation/tool pages, programmatic SEO) |
| `price_alerts` | Standalone price-alert subscriptions for securities |
| `watchlist` | Customer equity watchlist |

## Modules deferred (kept on disk, de-registered)

| Module | Reason |
|---|---|
| `gamification` | Loyalty/points engine. Re-enable post-MVP for B2B retention. |

## Store API routes removed (`src/api/store/`)

`calcula/`, `share-popularity/`, `ovo/`, `online-visibility-optimization/`, `price-alerts/`, `watchlist/`, `bank-accounts/`, `demat-accounts/`, `ifsc/`, `kyc/`, `content/`, `ai/`, `me/client-id/`, `orders/[order_id]/share-transfer/`

## Admin API routes removed (`src/api/admin/`)

`calcula/`, `aadhaar-records/`, `bank-accounts/`, `bank-records/`, `cmr-records/`, `customer-client-id/`, `demat-accounts/`, `deposit-proofs/`, `identity-registry/`, `kyc-overview/`, `manual-kyc-queues/`, `manual-kyc-requests/`, `ovo/`, `pan-records/`, `secure-id-verifications/`, `share-transfers/`, `content/`, `customers/[customer_id]/provision-vba/`

## Webhook routes removed (`src/api/webhooks/`)

`calcula/`

## Admin UI extensions removed (`src/admin/`)

**Routes:** `aadhaar-records/`, `bank-records/`, `cmr-records/`, `identity-registry/`, `manual-kyc/`, `ovo1/`, `pan-records/`, `content/`, `customer-360/`, `bulk-editor/`, `wallets/`

**Widgets:** `calcula-fields.tsx`, `customer-360-link.tsx`, `ovo-category-override.tsx`, `ovo-product-override.tsx`

**Components:** `CustomerSearch.tsx` (will be replaced by Medusa's native customer search), `OvoOverrideForm.tsx`

Note: `customer-360/`, `bulk-editor/`, and `wallets/` admin pages will be **rebuilt** in Phases 4 (customer/company 360), 10 (B2B bulk editor), and 5 (B2B wallet console) on top of the new RISITEX schema. The Polemarch versions exposed equity-specific fields (Aadhaar/PAN/demat/client_id/Calcula columns) that don't map to the textile B2B model.

## Subscribers removed (`src/subscribers/`)

`calcula-company-updated.ts`, `calcula-price-sync.ts`, `calcula-variant-price-sync.ts`, `customer-client-id.ts`, `share-transfer-fulfill.ts`, `share-transfer-init.ts`, `share-transfer-notifier.ts`, `aml-flag-order.ts`, `content-comparison.ts`, `content-page-archived.ts`, `content-page-published.ts`, `content-page-updated.ts`, `content-tool.ts`, `content-valuation.ts`, `internal-link-inserted.ts`, `ai-budget-exceeded.ts`

## Jobs removed (`src/jobs/`)

`kyc-pending-reminder.ts`, `sync-calcula-snapshots.ts`, `vba-reconcile-payments.ts`, `ai-citation-weekly.ts`, `ai-content-budget-rollover.ts`, `ai-content-generate.ts`, `content-regenerate-stale.ts`, `embedding-backfill.ts`, `internal-link-rescore.ts`, `keyword-opportunity-detector.ts`, `keyword-performance-rollup.ts`, `seo-audit-nightly.ts`, `seo-daily-ingest.ts`, `url-index-daily.ts`

## Scripts removed (`src/scripts/`)

`_legacy-knowledge.json`, `backfill-aadhaar-photos.ts`, `backfill-client-ids.ts`, `backfill-cmr-registry.ts`, `backfill-identity-registry.ts`, `check-vba-status.ts`, `find-orphan-vbas.ts`, `migrate-knowledge-to-content.ts`, `provision-vba-for.ts`, `scan-vba-payments.ts`, `seed-content-defaults.ts`, `seed-keyword-targets.ts`, `sync-vba-allowed-remitters.ts`, `mirror-customer-metadata-keys.ts`

## Utilities removed (`src/utils/`)

`dpdp/` — customer export/scrub/hard-delete helpers (referenced `watchlist` + `customer_identity`). Will be rebuilt against the new RISITEX schema during the compliance pass.

## Lib helpers removed (`src/lib/`)

`schema-ctx.ts` — JSON-LD/SEO schema resolver tightly coupled to OVO + `polemarch_content`.

## `medusa-config.ts` registration changes

Removed: `calcula`, `customer_identity`, `share_transfer`, `watchlist`, `price_alerts`, `online_visibility_optimization`, `polemarch_content`.
De-registered (kept on disk): `gamification`.
Kept unchanged: `polemarch` (audit substrate), `cashfree_wallet`, `cashfree_wallet_provider`, `file_storage`, `file_storage_provider`, `password_history`, `polemarch_communication`, `polemarch_email_provider`, Notification, Payment, Event Bus, Cache, Workflow Engine, Locking, File.

ERPNext plugin moved from `file:../../packages/medusa-plugin-erpnext` (cross-monorepo path) to `file:./packages/medusa-plugin-erpnext` (in-repo); will be renamed `@risitex/medusa-plugin-erpnext` in Phase 8.

## Tally

| Bucket | Count |
|---|---:|
| Modules removed | 7 |
| Modules deferred | 1 |
| Store routes removed | 14 |
| Admin routes removed | 18 |
| Webhook routes removed | 1 |
| Admin UI routes removed | 11 |
| Admin widgets/components removed | 6 |
| Subscribers removed | 16 |
| Jobs removed | 14 |
| Scripts removed | 14 |
| Utility dirs/files removed | 2 |
| **Files+dirs touched** | **~125** |
