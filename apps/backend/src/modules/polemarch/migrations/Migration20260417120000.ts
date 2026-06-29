import { Migration } from "@mikro-orm/migrations"

/**
 * `polemarch_job_run` — supervision table for scheduled cron jobs.
 *
 * One row per job name (primary key). Each wrapped cron body updates
 * this row on every execution — success / failure counters, last
 * success / last error timestamps, last error message. The admin
 * route `GET /admin/job-health` reads these rows, computes a verdict
 * per job (ok / late / stale / failing / never), and returns 503 when
 * anything is on fire so plain HTTP-code uptime monitors catch it.
 */
export class Migration20260417120000 extends Migration {
    async up(): Promise<void> {
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_job_run" (
                "id" TEXT NOT NULL,
                "schedule" TEXT NULL,
                "last_ok_at" TIMESTAMPTZ NULL,
                "last_run_at" TIMESTAMPTZ NULL,
                "last_error_at" TIMESTAMPTZ NULL,
                "last_error" TEXT NULL,
                "last_duration_ms" INTEGER NULL,
                "total_runs" INTEGER NOT NULL DEFAULT 0,
                "success_runs" INTEGER NOT NULL DEFAULT 0,
                "fail_runs" INTEGER NOT NULL DEFAULT 0,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMPTZ NULL,
                CONSTRAINT "polemarch_job_run_pkey" PRIMARY KEY ("id")
            );
        `)
        this.addSql(
            `CREATE INDEX IF NOT EXISTS "IDX_polemarch_job_run_deleted_at" ON "polemarch_job_run" ("deleted_at") WHERE deleted_at IS NULL;`,
        )
    }

    async down(): Promise<void> {
        this.addSql(`DROP TABLE IF EXISTS "polemarch_job_run" CASCADE;`)
    }
}
