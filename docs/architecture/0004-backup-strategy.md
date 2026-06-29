# 0004 — Backup strategy: pg_dump for dev, WAL archiving for prod

**Status:** Accepted (2026-06-10)
**Phase:** 4 (dev), Phase 10 (prod)

## Context

We need a documented backup story so a junior dev knows what to do before risky migrations, and so we have a plan for production data durability.

## Decision

### Local dev (now)

- `pg_dump -Fc -Z 5` (custom format, level-5 zstd-style compression) into `infrastructure/postgres/backups/<dbname>-<timestamp>.dump`.
- Triggered manually by `.\infrastructure\postgres\backup.ps1`. No cron.
- Restore via `.\infrastructure\postgres\restore.ps1 -DumpFile <file>`.
- `backups/` is gitignored — local backups never leave the laptop.
- RPO is "whatever's most recent backup file" — acceptable because losing dev data is annoying, not catastrophic.

### Production (Phase 10)

- WAL archiving to off-host storage (Hetzner Storage Box or S3-compatible).
- Periodic base backups (`pg_basebackup`) on a schedule (e.g. nightly).
- PITR (point-in-time recovery) capability.
- Target **RPO ≤ 5 minutes**, **RTO ≤ 30 minutes**.
- Backups verified by restore-into-throwaway-DB once a week (untested backups are not backups).
- Off-host retention: 30 daily, 12 monthly, 5 yearly.
- All of the above lives in a `infrastructure/postgres/wal/` sibling folder created in Phase 10.

## Consequences

**Good**
- Phase 4 stays small — no extra containers, no extra volumes, no extra config.
- A clear documented mechanism exists for "snapshot before a risky migration."
- The Phase 10 plan is explicit so there's no "we'll figure it out" debt.

**Bad / tradeoffs**
- Local backup files live on disk only. If your laptop dies, the local DB is gone. Acceptable for dev — anything important is in a migration file or seed script.

**Reversibility**
- The Phase 10 WAL setup is purely additive. Adding it doesn't break dev. The dev `pg_dump` script keeps working for ad-hoc snapshots.
