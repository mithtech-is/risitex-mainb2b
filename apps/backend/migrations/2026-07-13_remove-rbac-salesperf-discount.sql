-- 2026-07-13 — Remove three custom subsystems and switch discounts to native.
--
--   * rbac                (role grants)        — modules/rbac
--   * sales_performance   (sales-rep + commissions)
--   * discount_code       (custom promo metadata layer)
--
-- Discount codes are now handled entirely by Medusa's NATIVE promotions
-- module (created in the admin Promotions UI). The custom discount_code table
-- only added a thin metadata layer on top and is no longer used.
--
-- Idempotent + safe to re-run. Apply at deploy with:
--   docker exec -i <postgres> psql -U <user> -d <db> < this-file.sql
-- (Medusa `db:migrate` does not run these raw-SQL migrations.)

-- ── discount_code module ────────────────────────────────────────────────
DROP TABLE IF EXISTS "discount_code" CASCADE;

-- ── sales_performance module (sales-rep + commissions) ──────────────────
-- commission_record has an FK to commission_rule; CASCADE drops it cleanly.
DROP TABLE IF EXISTS "commission_record" CASCADE;
DROP TABLE IF EXISTS "commission_rule" CASCADE;
DROP TABLE IF EXISTS "sales_rep_assignment" CASCADE;
DROP TABLE IF EXISTS "sales_rep" CASCADE;

-- ── rbac module (role grants) ───────────────────────────────────────────
DROP TABLE IF EXISTS "rbac_user_role" CASCADE;
DROP TABLE IF EXISTS "rbac_role_permission" CASCADE;
DROP TABLE IF EXISTS "rbac_role" CASCADE;

-- ── cross-table soft-FK columns pointing at the removed sales_rep ────────
-- Dropping the column also removes its single-column partial index.
DROP INDEX IF EXISTS "IDX_company_sales_rep_id";
ALTER TABLE IF EXISTS "company"  DROP COLUMN IF EXISTS "sales_rep_id";
ALTER TABLE IF EXISTS "customer" DROP COLUMN IF EXISTS "sales_rep_id";
