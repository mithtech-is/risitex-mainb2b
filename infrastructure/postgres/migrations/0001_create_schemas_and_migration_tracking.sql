-- 0001: Schemas + migration tracking
--
-- Creates the RISITEX-specific schemas and the public.schema_migrations table.
-- Medusa keeps the `public` schema for its own tables (Phase 5).

BEGIN;

-- Schemas
CREATE SCHEMA IF NOT EXISTS risitex_org;
CREATE SCHEMA IF NOT EXISTS risitex_affiliate;
CREATE SCHEMA IF NOT EXISTS risitex_textile;
CREATE SCHEMA IF NOT EXISTS risitex_erp;
CREATE SCHEMA IF NOT EXISTS risitex_audit;

COMMENT ON SCHEMA risitex_org IS 'B2B organisation entities: companies, customer tiers, sales reps, credit limits.';
COMMENT ON SCHEMA risitex_affiliate IS 'Affiliate program: affiliates, referrals, wallets, commissions, payouts.';
COMMENT ON SCHEMA risitex_textile IS 'Textile-domain data: matrix ordering, MOQ rules, master cartons.';
COMMENT ON SCHEMA risitex_erp IS 'ERPNext integration: sync jobs, logs, entity mappings.';
COMMENT ON SCHEMA risitex_audit IS 'Append-only audit trail.';

-- Migration tracking
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT        NOT NULL DEFAULT current_user,
  checksum    TEXT        NOT NULL
);

COMMENT ON TABLE public.schema_migrations IS 'RISITEX hand-written SQL migrations applied. Medusa has its own table (mikro_orm_migrations) it manages itself.';

COMMIT;
