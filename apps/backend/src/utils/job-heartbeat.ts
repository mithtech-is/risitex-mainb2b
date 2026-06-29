/**
 * Job heartbeat helper — wrap scheduled-job bodies so each run writes
 * its outcome to `polemarch_job_run` (name, ok, timestamps, duration,
 * error). `GET /admin/job-health` reads those rows; uptime monitors
 * poll that endpoint and alert if `last_ok_at` falls behind the job's
 * schedule.
 *
 * Usage:
 *
 *     // src/jobs/sync-calcula-snapshots.ts
 *     import { withHeartbeat } from "../utils/job-heartbeat"
 *
 *     export default async function syncCalculaSnapshots(container) {
 *         await withHeartbeat(container, "sync-calcula-snapshots", config, async () => {
 *             // …the actual job body…
 *         })
 *     }
 *     export const config = { schedule: "* * * * *" }
 *
 * Errors inside the body are captured to the row and re-thrown so
 * Medusa's job runner still sees the failure (retries, logs, Sentry
 * etc. remain intact).
 */

import type { MedusaContainer } from "@medusajs/framework/types"

export type JobConfig = { schedule?: string }

const MAX_ERROR_LEN = 1024

export async function withHeartbeat<T>(
    container: MedusaContainer,
    name: string,
    config: JobConfig,
    body: () => Promise<T>,
): Promise<T> {
    const startedAt = Date.now()
    const runTimestamp = new Date()
    let polemarch: any
    try {
        polemarch = container.resolve("polemarch")
    } catch {
        // Module not resolvable during tests or in a detached job
        // container — run the body without bookkeeping.
        return body()
    }

    try {
        const result = await body()
        const duration = Date.now() - startedAt
        await upsertRun(polemarch, name, {
            schedule: config.schedule ?? null,
            last_ok_at: new Date(),
            last_run_at: runTimestamp,
            last_duration_ms: duration,
            success: true,
        })
        return result
    } catch (err: any) {
        const message = String(err?.message ?? err ?? "unknown error").slice(
            0,
            MAX_ERROR_LEN,
        )
        await upsertRun(polemarch, name, {
            schedule: config.schedule ?? null,
            last_run_at: runTimestamp,
            last_error_at: new Date(),
            last_error: message,
            success: false,
        }).catch(() => {
            /* if we can't even record the failure, don't shadow the
             * original error — re-throw it unchanged. */
        })
        throw err
    }
}

type UpsertInput = {
    schedule: string | null
    last_run_at: Date
    last_ok_at?: Date
    last_error_at?: Date
    last_error?: string
    last_duration_ms?: number
    success: boolean
}

async function upsertRun(polemarch: any, name: string, patch: UpsertInput) {
    const existing = (await polemarch.listJobRuns({ id: name }))?.[0]
    const total = (existing?.total_runs ?? 0) + 1
    const row: any = {
        id: name,
        schedule: patch.schedule,
        last_run_at: patch.last_run_at,
        total_runs: total,
    }
    if (patch.success) {
        row.last_ok_at = patch.last_ok_at
        row.last_duration_ms = patch.last_duration_ms
        row.success_runs = (existing?.success_runs ?? 0) + 1
        row.fail_runs = existing?.fail_runs ?? 0
        // Clear stale error on recovery so operators see a fresh green.
        row.last_error = null
    } else {
        row.last_error_at = patch.last_error_at
        row.last_error = patch.last_error
        row.success_runs = existing?.success_runs ?? 0
        row.fail_runs = (existing?.fail_runs ?? 0) + 1
        row.last_ok_at = existing?.last_ok_at ?? null
        row.last_duration_ms = existing?.last_duration_ms ?? null
    }
    if (existing) {
        await polemarch.updateJobRuns(row)
    } else {
        await polemarch.createJobRuns(row)
    }
}

/** Compute a per-job "health" verdict from its last-ok timestamp + the
 *  schedule it was registered with. Used by the admin route.
 *
 *    - `ok`    — last-ok within 2× the cadence
 *    - `late`  — last-ok between 2× and 5× the cadence
 *    - `stale` — last-ok beyond 5× (the monitor should page)
 *    - `never` — no last-ok at all
 *    - `failing` — fail_runs > success_runs since the last reset
 */
export function computeJobHealth(row: {
    schedule: string | null
    last_ok_at: Date | string | null
    last_error_at: Date | string | null
    last_error: string | null
    success_runs: number
    fail_runs: number
}): {
    status: "ok" | "late" | "stale" | "never" | "failing"
    last_ok_ms_ago: number | null
    expected_every_ms: number | null
} {
    const cadenceMs = cadenceFromCron(row.schedule)
    const lastOk = row.last_ok_at ? new Date(row.last_ok_at) : null
    const lastOkMs = lastOk ? Date.now() - lastOk.getTime() : null

    if (row.fail_runs > row.success_runs && row.fail_runs > 0) {
        return { status: "failing", last_ok_ms_ago: lastOkMs, expected_every_ms: cadenceMs }
    }
    if (!lastOk) {
        return { status: "never", last_ok_ms_ago: null, expected_every_ms: cadenceMs }
    }
    if (!cadenceMs) {
        // Unknown schedule — treat as ok if we have any last-ok at all.
        return { status: "ok", last_ok_ms_ago: lastOkMs, expected_every_ms: null }
    }
    const lag = lastOkMs! / cadenceMs
    if (lag > 5) return { status: "stale", last_ok_ms_ago: lastOkMs, expected_every_ms: cadenceMs }
    if (lag > 2) return { status: "late", last_ok_ms_ago: lastOkMs, expected_every_ms: cadenceMs }
    return { status: "ok", last_ok_ms_ago: lastOkMs, expected_every_ms: cadenceMs }
}

/** Minimal cron parser — handles the common cases we use (every minute,
 *  every N minutes, every hour, every day). Returns null for anything
 *  more exotic; the admin route treats null as "unknown cadence". */
function cadenceFromCron(expr: string | null | undefined): number | null {
    if (!expr) return null
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) return null
    const [minute, hour, dom, month, dow] = parts
    // Every minute: `* * * * *`
    if (minute === "*" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
        return 60_000
    }
    // Every N minutes: `*/N * * * *`
    const everyN = minute.match(/^\*\/(\d+)$/)
    if (everyN && hour === "*" && dom === "*" && month === "*" && dow === "*") {
        const n = Number(everyN[1])
        if (n > 0 && n < 60) return n * 60_000
    }
    // Every hour at minute M: `M * * * *`
    if (/^\d+$/.test(minute) && hour === "*" && dom === "*" && month === "*" && dow === "*") {
        return 60 * 60_000
    }
    // Daily at HH:MM: `M H * * *`
    if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === "*" && month === "*" && dow === "*") {
        return 24 * 60 * 60_000
    }
    return null
}
