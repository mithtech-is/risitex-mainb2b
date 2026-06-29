# RISITEX Production Readiness Checklist

Status as of Phase 10 commit. Items marked **[CODE]** are implemented in this repo; **[OPS]** items need infrastructure work before going live.

## Secrets

- [ ] **[OPS]** Rotate every value in `apps/backend/.env.template` for production. Generators:
  - `JWT_SECRET` / `COOKIE_SECRET`: `openssl rand -base64 64`
  - DB password: `openssl rand -base64 48`
- [ ] **[OPS]** Move secrets out of `.env` into a real secret manager (AWS Secrets Manager / Hetzner Vault / Doppler). Env file in repo is `.env.template` only — never `.env`.
- [ ] **[OPS]** Audit `LogisticsProvider.api_credentials_ref` — must point to a secret-manager key, NOT contain the key itself. Service code enforces this via convention only; review at PR time.
- [ ] **[OPS]** ERPNext API keys (`ERPNEXT_API_KEY` / `ERPNEXT_API_SECRET`) — issue per-environment, rotate quarterly.

## Database

- [x] **[CODE]** Migrations tracked via `medusa db:migrate` + per-module migration files committed.
- [x] **[CODE]** Backup script: `infrastructure/postgres/backup.ps1` (pg_dump -Fc).
- [ ] **[OPS]** WAL archiving + point-in-time recovery (ADR 0004 has the plan — implement in deployment).
- [ ] **[OPS]** Read-replica for analytics if scan-heavy reporting workloads emerge.
- [ ] **[OPS]** Connection pooler (pgbouncer transaction mode) in front of Postgres for the API workload.
- [ ] **[OPS]** `pg_stat_statements` enabled; alert on top-N slow queries weekly.

## Redis

- [x] **[CODE]** `noeviction` policy in `infrastructure/docker/docker-compose.yml` (Medusa's workflow engine can NOT tolerate eviction).
- [ ] **[OPS]** Verify the *running* container's policy matches compose (`redis-cli config get maxmemory-policy`). Pre-existing containers may still report `allkeys-lru` until `docker compose up -d --force-recreate redis`.
- [ ] **[OPS]** Persist Redis with both AOF + RDB in prod.
- [ ] **[OPS]** If memory pressure looms, split workflow-engine onto a dedicated Redis instance — co-tenancy with cache + event bus is fine in dev but risky once volume grows.

## Auth & RBAC

- [x] **[CODE]** RBAC tables seeded with 9 canonical roles (`pnpm seed:rbac`).
- [x] **[CODE]** `requirePermission`, `assertPermission`, `requireCompanyMembership`, `validateImpersonationMiddleware` helpers in `src/lib/auth/`.
- [x] **[CODE]** Sales-rep impersonation: 256-bit base64url session token; auto-validated on `X-Impersonation-Token` header for `/store/*`.
- [ ] **[CODE]** Apply `requirePermission(...)` on each `/admin/*` route handler. The middleware system is in place; opt-in per route as the admin-only surface area solidifies.
- [ ] **[OPS]** Configure OAuth providers (Google, GitHub) for admin SSO — Medusa's `auth-google` and `auth-github` are installed but disabled.
- [ ] **[OPS]** Set `JWT_SECRET` to ≥ 64 bytes random; rotate on user-credential breach.

## Rate limiting & security headers

- [x] **[CODE]** `helmet`-based security headers via `src/lib/security/headers.ts`. In production (`NODE_ENV=production`), strict CSP + HSTS enabled.
- [x] **[CODE]** `express-rate-limit` per zone:
  - `/auth/*` — 10 req/min/IP (brute-force ceiling)
  - `/store/*` — 60 req/min/IP
  - `/hooks/*` — 600 req/min/IP
- [ ] **[OPS]** Swap the in-memory rate-limit store for `rate-limit-redis` once running multi-instance (single-instance = OK for early prod).
- [ ] **[OPS]** WAF / Cloudflare in front; trust `CF-Connecting-IP` for rate limit key.

## Observability

- [x] **[CODE]** `/health` (Medusa built-in) — liveness; returns 200 when express is alive.
- [x] **[CODE]** `/readyz` — readiness; checks DB + Redis + reports git SHA + uptime.
- [ ] **[OPS]** Wire `/readyz` to k8s readinessProbe / Hetzner LB.
- [ ] **[OPS]** Set `GIT_SHA` env var at build/deploy time for the readyz response.
- [ ] **[OPS]** Structured logs (JSON) shipped to a log store (Loki / CloudWatch). Medusa uses pino — set `LOG_FORMAT=json`.
- [ ] **[OPS]** APM: OpenTelemetry SDK with traces to a backend (Jaeger / Honeycomb / Datadog).
- [ ] **[OPS]** Sentry (or equivalent) for unhandled exceptions; load via instrumentation file before Medusa starts.
- [ ] **[OPS]** Grafana dashboards for: order placement rate, ERPNext sync queue depth + lag, wallet transactions/s, rate-limit hits, 4xx/5xx by route.

## ERPNext sync

- [x] **[CODE]** Idempotent queue (`erp_sync_job.idempotency_key UNIQUE`).
- [x] **[CODE]** Exponential backoff (5s → 25s → 2m → 10m → 60m) with `max_attempts` cap.
- [x] **[CODE]** Subscribers wire customer / order / fulfillment events into the queue.
- [x] **[CODE]** Worker scheduled every 30s; processes ≤ 25 jobs/tick sequentially.
- [ ] **[OPS]** Configure `ERPNEXT_*` env vars in prod. Until set, jobs accumulate in `pending`/`dead` — drains automatically once env is filled.
- [ ] **[OPS]** Alert on `erp_sync_job.status='dead'` count over 24h (Grafana query).
- [ ] **[OPS]** Manual retry runbook for dead jobs: `POST /admin/erp-sync-jobs/:id/retry`.

## Workflows

- [x] **[CODE]** 6 workflows live (`src/workflows/`): register-company, approve-company, attribute-affiliate-referral, earn-commission-for-order, payout-commission, enqueue-erpnext-sync.
- [x] **[CODE]** Compensation hooks on register-company + approve-company.
- [ ] **[CODE]** When real undo scenarios emerge (e.g. order placed → cart abandoned during payment), split the affected workflows into multi-step DAGs and add per-step compensation. Single-step today is intentional.

## Money & ledger correctness

- [x] **[CODE]** All money fields stored as `bigNumber` (BIGINT in DB).
- [x] **[CODE]** Wallet ledger is append-only; balance is materialized from credits/debits; `verify` endpoint replays the ledger.
- [x] **[CODE]** Commission rules use BigInt math (`percent * 100 / 10000`) to avoid FP rounding.
- [ ] **[OPS]** Scheduled job: run wallet `verify` on a sample of wallets nightly; alert on mismatch.
- [ ] **[OPS]** Quarterly external audit of `wallet_transaction` totals vs ERPNext journal entries.

## Logistics

- [x] **[CODE]** `logistics_provider.api_credentials_ref` is a secret-manager pointer; never store raw keys.
- [x] **[CODE]** Shipment status state machine prevents regression from `delivered`.
- [ ] **[CODE]** Per-provider webhook handlers (Shiprocket, Delhivery, Porter) — TBD when integrating each.
- [ ] **[OPS]** Carrier rate-quote scoring beyond pure priority — add in a follow-up phase.

## Frontend / Admin UI

- [x] **[CODE]** Admin UI bundle works under pnpm thanks to `.npmrc shamefully-hoist=true`.
- [ ] **[CODE]** Admin extensions (custom pages for Company, CustomerTier, SalesRep, Affiliate, Commission, MOQ, MasterCarton, Matrix, ERPSync, Warehouse, Logistics) — REST is live; UI widgets land in a later phase.
- [ ] **[OPS]** Storefront (Next.js) — not in this monorepo yet; planned `apps/web` later.

## Deployment

- [ ] **[OPS]** Dockerfile for `apps/backend` (multi-stage; non-root user; healthcheck on `/readyz`).
- [ ] **[OPS]** Compose/Helm chart for production with separate Redis instances per role.
- [ ] **[OPS]** Zero-downtime deploy strategy: blue/green or rolling with `pre-stop` hook to drain in-flight jobs.
- [ ] **[OPS]** Database migrations gated behind a CI step that runs `pnpm db:migrate --dry-run` (Medusa doesn't have this flag yet — wrap in a custom check OR use the snapshot files committed under `src/modules/*/migrations/` as the diff source).

## CI / CD

- [ ] **[OPS]** GitHub Actions or equivalent:
  - `pnpm install --frozen-lockfile`
  - `pnpm -r typecheck`
  - `pnpm -r lint`
  - `pnpm --filter @risitex/backend build`
  - Tests (need writing — Vitest + supertest)
- [ ] **[OPS]** Branch protection: PR review + status checks required.
- [ ] **[OPS]** Renovate or equivalent for dependency updates.

## Backup & DR

- [x] **[CODE]** Backup script at `infrastructure/postgres/backup.ps1`.
- [ ] **[OPS]** Schedule the backup script (cron/Task Scheduler). Verify restore quarterly.
- [ ] **[OPS]** Off-site backup copy (S3 with object lock for ransomware resilience).
- [ ] **[OPS]** Runbook for: full restore, partial restore (single tenant), key rotation.

## Compliance

- [ ] **[OPS]** PII inventory: customers (email, phone, address, GST), companies (legal name, GSTIN, PAN).
- [ ] **[OPS]** Data export / deletion API for GDPR-style right-to-erase (Indian DPDP Act 2023 requires similar).
- [ ] **[OPS]** GSTIN format validation on entry; already enforced at DTO layer (`WarehouseProfileDto`).
- [ ] **[OPS]** Tax invoice numbering compliant with GST rules — handled by ERPNext post-sync, NOT regenerated in Medusa.
