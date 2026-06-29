import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { computeJobHealth } from "../../../utils/job-heartbeat"

/**
 * GET /admin/job-health
 *
 * Supervision endpoint for scheduled jobs. Returns one row per
 * registered job with its last-success timestamp, last-error message,
 * and a computed health verdict ("ok" / "late" / "stale" / "failing" /
 * "never"). Uptime monitors (UptimeRobot, Better Stack) should poll
 * this and alert when any row reports non-ok.
 *
 * Top-level response shape:
 *
 *   {
 *     ok: boolean,         // false if ANY job is non-ok
 *     as_of: <ISO>,
 *     jobs: [
 *       {
 *         name: string,
 *         schedule: string | null,
 *         status: "ok" | "late" | "stale" | "failing" | "never",
 *         last_ok_at: ISO | null,
 *         last_run_at: ISO | null,
 *         last_error_at: ISO | null,
 *         last_error: string | null,
 *         last_duration_ms: number | null,
 *         last_ok_ms_ago: number | null,
 *         expected_every_ms: number | null,
 *         total_runs: number,
 *         success_runs: number,
 *         fail_runs: number,
 *       }
 *     ]
 *   }
 *
 * Non-200 response (503) when any job is `stale` / `failing`, so a
 * plain "HTTP 200?" monitor can be wired without reading the body.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const polemarch = req.scope.resolve("polemarch") as any
        const rows = (await polemarch.listJobRuns({}, { take: 200 })) as any[]

        const jobs = rows.map((row) => {
            const health = computeJobHealth({
                schedule: row.schedule,
                last_ok_at: row.last_ok_at,
                last_error_at: row.last_error_at,
                last_error: row.last_error,
                success_runs: row.success_runs ?? 0,
                fail_runs: row.fail_runs ?? 0,
            })
            return {
                name: row.id,
                schedule: row.schedule,
                status: health.status,
                last_ok_at: row.last_ok_at,
                last_run_at: row.last_run_at,
                last_error_at: row.last_error_at,
                last_error: row.last_error,
                last_duration_ms: row.last_duration_ms,
                last_ok_ms_ago: health.last_ok_ms_ago,
                expected_every_ms: health.expected_every_ms,
                total_runs: row.total_runs ?? 0,
                success_runs: row.success_runs ?? 0,
                fail_runs: row.fail_runs ?? 0,
            }
        })

        const ok = jobs.every((j) => j.status === "ok")
        const payload = {
            ok,
            as_of: new Date().toISOString(),
            jobs: jobs.sort((a, b) => a.name.localeCompare(b.name)),
        }

        // Return 503 when anything is on fire so plain uptime monitors
        // only need to watch the status code. 200 when everything's fine.
        return res.status(ok ? 200 : 503).json(payload)
    } catch (err: any) {
        console.error("[admin/job-health] GET failed:", err)
        return res
            .status(500)
            .json({ ok: false, message: err?.message ?? "job-health query failed" })
    }
}
