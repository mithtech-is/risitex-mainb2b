# 0003 — Postgres schemas: one schema per RISITEX domain, Medusa keeps `public`

**Status:** Accepted (2026-06-10)
**Phase:** 4

## Context

We have two sources of tables in the same Postgres database:

1. **Medusa's own tables** (created by Medusa migrations in Phase 5+). 40+ tables for products, customers, orders, inventory, prices, sales channels, etc.
2. **RISITEX-specific tables** (companies, customer tiers, affiliates, wallets, matrix ordering, MOQ, master cartons, ERPNext sync, audit).

If both live in `public`, the namespace becomes noisy and it's hard to scan "what's mine vs Medusa's". We also want different RBAC for different domains later (e.g. an analytics user that can read `risitex_audit` and nothing else).

## Decision

- **Medusa keeps `public`** entirely. We add only `public.schema_migrations` (our migration tracking table).
- **RISITEX hand-written tables** live in dedicated schemas:
  - `risitex_org` — companies, customer tiers, sales reps, credit limits.
  - `risitex_affiliate` — affiliates, referrals, wallets, commissions, payouts.
  - `risitex_textile` — matrix ordering, MOQ rules, master cartons.
  - `risitex_erp` — ERPNext sync infrastructure.
  - `risitex_audit` — append-only audit log.
- **Cross-schema FKs** are fine inside the RISITEX schemas (e.g. `risitex_affiliate.wallets.company_id` → `risitex_org.companies.id`).
- **References to Medusa entities** are stored as `TEXT` with **no FK**. Medusa IDs are TEXT in 2.x, and we don't want our schema to break if Medusa renames tables, switches to numeric IDs, or moves rows between tenants.

## Consequences

**Good**
- Easy mental model: schema prefix tells you the domain.
- pgAdmin's tree organizes neatly.
- Per-schema role grants in Phase 10: analytics user can `GRANT SELECT ON ALL TABLES IN SCHEMA risitex_audit` without touching the rest.
- Migrating to a multi-database split later is mostly mechanical.

**Bad / tradeoffs**
- Queries need fully-qualified names (`risitex_org.companies`) — verbose. JOIN performance is unchanged.
- Custom Medusa modules (Phase 6) need to be configured to read/write across schemas. Doable, just one more thing to remember.
- Soft references to Medusa IDs mean orphaned rows possible if Medusa deletes a customer or product. We'll handle this with periodic reconciliation jobs (Phase 9 territory).

**Reversibility**
- Collapsing to `public` is `ALTER TABLE risitex_org.companies SET SCHEMA public` per table.
