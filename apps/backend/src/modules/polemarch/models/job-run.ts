import { model } from "@medusajs/framework/utils"

/**
 * Supervision row for Medusa scheduled jobs (cron workflows).
 *
 * One row per job name (primary key). Every execution of a
 * heartbeat-wrapped job writes the outcome here — counters, last
 * success/error timestamps, last error message.
 *
 * The `GET /admin/job-health` route reads this table and flags jobs
 * whose `last_ok_at` has fallen behind the expected cadence. Uptime
 * monitors (UptimeRobot / Better Stack) hit that endpoint directly.
 */
export const JobRun = model.define("polemarch_job_run", {
    /** Job identifier (`sync-calcula-snapshots`, etc.). One row per job. */
    id: model.id().primaryKey(),
    /** Cron expression the job was registered with. Mirrored here so the
     *  admin UI can show "last-successful — expected every N minutes"
     *  without re-importing the job module. */
    schedule: model.text().nullable(),
    /** ISO timestamp of the last successful run. Null until the first
     *  run completes. */
    last_ok_at: model.dateTime().nullable(),
    /** ISO timestamp of the last attempted run (success or fail). Used
     *  to detect "job stopped firing" scenarios. */
    last_run_at: model.dateTime().nullable(),
    /** ISO timestamp of the last failure. Null when the job has never
     *  failed. */
    last_error_at: model.dateTime().nullable(),
    /** Error message from the last failure, truncated to 1 KB. Null on
     *  success. */
    last_error: model.text().nullable(),
    /** Duration of the last successful run, in milliseconds. */
    last_duration_ms: model.number().nullable(),
    /** Lifetime counters. */
    total_runs: model.number().default(0),
    success_runs: model.number().default(0),
    fail_runs: model.number().default(0),
})
