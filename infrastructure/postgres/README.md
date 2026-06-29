# infrastructure/postgres

Hand-written PostgreSQL schemas, migrations, and backup scripts for RISITEX.

This is **not** where Medusa's tables live. Medusa creates its own tables in the `public` schema using its own migration tooling (Phase 5+). This folder owns everything Medusa can't model: B2B org structures, affiliate economics, the textile-domain primitives (matrix / MOQ / cartons), ERPNext sync queues, and the audit log.

---

## Schemas

| Schema | Purpose | Migrations |
| --- | --- | --- |
| `public` | Medusa's tables (Phase 5). We only own `public.schema_migrations` here. | 0001 |
| `risitex_org` | Companies, customer tiers, sales reps, credit limits | 0002, 0003, 0004 |
| `risitex_affiliate` | Affiliates, referrals, wallets, commissions, payouts | 0005 |
| `risitex_textile` | Matrix ordering, MOQ rules, master cartons | 0006 |
| `risitex_erp` | ERPNext sync queue + logs + entity mappings | 0007 |
| `risitex_audit` | Append-only audit trail | 0008 |

---

## Migration workflow

Migrations are plain SQL files named `NNNN_description.sql` in `migrations/`. The runner applies them in alphabetical order. Each file is wrapped in `BEGIN; ... COMMIT;` so it's atomic — any error rolls back.

**Apply pending migrations:**

```powershell
.\infrastructure\postgres\migrate.ps1
```

What the runner does:

1. Confirms `risitex-postgres` container is up.
2. Reads `POSTGRES_USER` + `POSTGRES_DB` from `infrastructure/docker/.env`.
3. Reads applied versions from `public.schema_migrations` (empty on first run).
4. For each unapplied `*.sql` file (alphabetical order):
   - `docker cp` it into the container,
   - `psql -v ON_ERROR_STOP=1 -f /tmp/_migration.sql`,
   - records `version` + SHA-256 `checksum` in `public.schema_migrations`.
5. Exits non-zero on first failure.

**Writing a new migration:**

1. Pick the next number: `0009_xxxxxx.sql`.
2. Wrap in `BEGIN; ... COMMIT;`.
3. Use `IF NOT EXISTS` and `ON CONFLICT` where possible — makes the file safe to re-run if you stop the runner mid-way.
4. Cross-schema foreign keys are fine. Define the target table before the referencing table, or `ALTER TABLE ADD CONSTRAINT` later in the same file.
5. **Never edit a migration after it has been applied.** Write a new migration to change behavior instead. Edited files keep their old SHA-256 and the schema is silently out of sync from the SQL.

**Foreign references to Medusa entities** (`customer_id`, `product_id`, `order_id`, etc.) are stored as `TEXT` with **no FK constraint**. Medusa's table IDs are TEXT in 2.x and we don't want our schema to break if Medusa renames tables or changes its primary key strategy.

---

## Backup

Local-dev backup (gitignored):

```powershell
.\infrastructure\postgres\backup.ps1
```

Output: `infrastructure/postgres/backups/<dbname>-<timestamp>.dump` (Postgres custom format, level-5 compressed).

Restore from a backup:

```powershell
.\infrastructure\postgres\restore.ps1 -DumpFile path\to\file.dump
```

Drops conflicting objects (`pg_restore -c --if-exists`) and reloads. Prompts for `yes` before continuing — pass `-Force` to skip the prompt (CI only).

See ADR `0004-backup-strategy.md` for what changes when we go to production.

---

## Connecting

Same as documented in `infrastructure/docker/README.md`. Quick recap:

- Host: `localhost`
- Port: from `POSTGRES_PORT` in `.env` (defaults to 5433 on this Windows machine because of the local PG 18 install on 5432).
- Database: `risitex`
- User: `risitex` (superuser inside the container).
- Password: from your `.env`.

In pgAdmin, the new schemas show up under `Servers > RISITEX (local) > Databases > risitex > Schemas`.

---

## Reset

To wipe everything and start over:

```powershell
docker compose -f infrastructure/docker/docker-compose.yml down -v
pnpm docker:up
.\infrastructure\postgres\migrate.ps1
```

Or use `.\scripts\reset.ps1` to do steps 1-2 plus clean the JS workspace.
