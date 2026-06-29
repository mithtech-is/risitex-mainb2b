-- 2026-06-15 — Polemarch purge.
--
-- Idempotent (DROP TABLE IF EXISTS … CASCADE) so safe to re-run on
-- any DB:
--   - fresh RISITEX DB: every statement is a no-op (the table never
--     existed); the migration still records itself in script_migrations.
--   - Polemarch data import: actually drops the equity/SEBI-KYC
--     residue.
--   - mid-state (most common today): drops the tables that
--     cashfree_wallet's migrations CREATE because Polemarch coupled
--     wallet ops with Cashfree-backed identity verification
--     (aadhaar/PAN/CMR/demat/bank-account penny-drop). The
--     cashfree_wallet module itself will be surgically pruned in
--     Phase 5 to stop creating these in the first place.
--
-- Source of the table list: docs/migration-plan.md §2.2 +
-- empirical scan of the fresh DB after running
-- `pnpm exec medusa db:migrate` against an empty risitex_v2 schema.
--
-- All DROPs use CASCADE — any FK from a still-KEPT table to a
-- to-be-dropped table is a bug we want to know about loudly. As of
-- Phase 3 no KEPT table FKs into any of these.
--
-- Run via:
--   pnpm exec medusa exec ./src/scripts/preflight-purge-check.ts
--   psql $DATABASE_URL -f migrations/2026-06-15_polemarch-purge.sql
--
-- (Top-level migrations/ SQL files are applied manually with psql —
-- they are not picked up by `medusa db:migrate`, which only runs
-- TypeScript MikroORM migrations under src/modules/*/migrations/.)

BEGIN;

-- ─── Equity / Calcula ────────────────────────────────────────
DROP TABLE IF EXISTS calcula_company_record CASCADE;

-- ─── SEBI KYC: per-PAN identity registry + ISO-week client IDs ──
DROP TABLE IF EXISTS customer_client_id CASCADE;
DROP TABLE IF EXISTS identity_registry CASCADE;

-- ─── Depository (BOID) electronic share transfer pipeline ─────
DROP TABLE IF EXISTS share_transfer_status CASCADE;

-- ─── Equity watchlist + price alerts ─────────────────────────
DROP TABLE IF EXISTS watchlist_item CASCADE;
DROP TABLE IF EXISTS watchlist CASCADE;
DROP TABLE IF EXISTS price_alert CASCADE;

-- ─── Online Visibility Optimization singleton ────────────────
DROP TABLE IF EXISTS ovo_setting CASCADE;

-- ─── KYC proof / verification records ────────────────────────
--
-- These are created by cashfree_wallet migrations even though we
-- only want the wallet half of that module. Cashfree's API surfaces
-- BOTH wallet (Auto-Collect / VBA) and identity verification (PAN
-- penny-drop, Aadhaar OTP, CMR demat validation, bank-account
-- penny-drop) via the same credential pair, so Polemarch put both
-- domains in one module. We're dropping the verification side here
-- and will excise the matching models + migrations in Phase 5.
DROP TABLE IF EXISTS aadhaar_record CASCADE;
DROP TABLE IF EXISTS pan_record CASCADE;
DROP TABLE IF EXISTS cmr_record CASCADE;
DROP TABLE IF EXISTS demat_account CASCADE;
DROP TABLE IF EXISTS bank_record CASCADE;
DROP TABLE IF EXISTS bank_account CASCADE;
DROP TABLE IF EXISTS secure_id_verification CASCADE;
DROP TABLE IF EXISTS manual_kyc_request CASCADE;
DROP TABLE IF EXISTS deposit_proof CASCADE;

-- ─── Polemarch content engine ────────────────────────────────
-- The polemarch_content module was removed in Phase 2; its 13
-- migrations are gone with it. Listed here defensively in case a
-- Polemarch data dump is ever imported.
DROP TABLE IF EXISTS content_page CASCADE;
DROP TABLE IF EXISTS content_category CASCADE;
DROP TABLE IF EXISTS content_author CASCADE;
DROP TABLE IF EXISTS content_comparison CASCADE;
DROP TABLE IF EXISTS content_valuation_page CASCADE;
DROP TABLE IF EXISTS content_tool_page CASCADE;
DROP TABLE IF EXISTS content_page_template CASCADE;
DROP TABLE IF EXISTS content_generated_page CASCADE;
DROP TABLE IF EXISTS content_page_revision CASCADE;
DROP TABLE IF EXISTS content_internal_link_suggestion CASCADE;
DROP TABLE IF EXISTS content_ai_budget CASCADE;

COMMIT;
