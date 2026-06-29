-- 2026-06-15 — extend Medusa customer with B2B linkage columns.
--
-- The Medusa core `customer` table is owned by the framework, so we
-- can't add MikroORM-managed columns through our own modules.
-- Instead we add three soft-FK TEXT columns + partial indexes via
-- raw SQL, applied with the same top-level migrations/ workflow as
-- the customer-integrity triggers.
--
--   - company_id          → company.id           (Phase 4, FR-1.02)
--   - customer_tier_id    → customer_tier.id     (Phase 4, FR-1.03)
--   - sales_rep_id        → sales_rep.id         (Phase 7, FR-8.01)
--   - payment_terms       → 'advance_100' | 'net_30' | 'net_60'
--                                                 (Phase 10, FR-4.03)
--
-- Soft-FK rather than real FK because:
--   1. Medusa 2.x doesn't use cross-module FKs (modules are loaded
--      in arbitrary order; the FK target may not exist at boot).
--   2. We want soft-deletes on company / customer_tier to NOT
--      cascade-delete customers — orphan-customer handling is an
--      ops decision, not a DB cascade.
--
-- Indexes are partial (only WHERE column IS NOT NULL) because the
-- vast majority of customers (post-B2C launch) will not have these
-- fields set; full indexes would bloat for no read benefit.
--
-- Run via:
--   psql $DATABASE_URL -f migrations/2026-06-15_customer-b2b-fields.sql
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).

BEGIN;

ALTER TABLE customer
    ADD COLUMN IF NOT EXISTS company_id        TEXT NULL,
    ADD COLUMN IF NOT EXISTS customer_tier_id  TEXT NULL,
    ADD COLUMN IF NOT EXISTS sales_rep_id      TEXT NULL,
    ADD COLUMN IF NOT EXISTS payment_terms     TEXT NULL
        CHECK (payment_terms IS NULL OR payment_terms IN ('advance_100','net_30','net_60'));

CREATE INDEX IF NOT EXISTS customer_company_id_idx
    ON customer (company_id)
    WHERE company_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS customer_customer_tier_id_idx
    ON customer (customer_tier_id)
    WHERE customer_tier_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS customer_sales_rep_id_idx
    ON customer (sales_rep_id)
    WHERE sales_rep_id IS NOT NULL AND deleted_at IS NULL;

COMMIT;
