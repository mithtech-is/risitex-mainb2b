import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * SEBI / PMLA stamp-duty audit trail — cross-order report.
 *
 *   GET /admin/orders/stamp-duty-audit
 *     ?from=YYYY-MM-DD
 *     &to=YYYY-MM-DD
 *     &missing=1   (only orders where the audit trail is incomplete)
 *     &limit=500   (defaults to 200, hard cap at 1000)
 *
 * Response is a flat list — one row per order, each row carrying the
 * full `stamp_duty_audit` subtree plus the order's own id / display
 * id / customer / total. This is the shape an auditor expects to
 * pull into Excel.
 *
 * Filtering:
 *   - `from` / `to` bound `o.created_at` (date-only, UTC).
 *   - `missing=1` returns only rows where at least one of
 *     `dis_initiated_at`, `consideration_paise`, `stamp_duty_paise`,
 *     or `remittance_ref` is still null — ops-triage view.
 */

type AuditRow = {
    order_id: string
    display_id: number | null
    created_at: string
    customer_id: string | null
    total_paise: number
    currency_code: string | null
    audit: {
        dis_initiated_at: string | null
        dis_completed_at: string | null
        consideration_paise: number | null
        stamp_duty_paise: number | null
        remittance_ref: string | null
        remitted_on: string | null
        state_code: string | null
        counterparty_dp: string | null
        notes: string | null
        updated_by: string | null
        updated_at: string | null
    }
    is_complete: boolean
}

function toIsoDate(s: unknown): string | null {
    if (typeof s !== "string") return null
    const t = Date.parse(s)
    if (!Number.isFinite(t)) return null
    return new Date(t).toISOString()
}

const REQUIRED_KEYS = [
    "dis_initiated_at",
    "consideration_paise",
    "stamp_duty_paise",
    "remittance_ref",
] as const

function isComplete(audit: any): boolean {
    if (!audit || typeof audit !== "object") return false
    for (const k of REQUIRED_KEYS) {
        const v = audit[k]
        if (v === null || v === undefined || v === "") return false
    }
    return true
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    const q = req.query || {}
    const from = toIsoDate(q.from) ?? toIsoDate("1970-01-01")!
    const to = toIsoDate(q.to) ?? new Date().toISOString()
    const missingOnly = q.missing === "1" || q.missing === "true"
    const limitRaw = Number(q.limit)
    const limit = Number.isFinite(limitRaw)
        ? Math.min(1000, Math.max(1, Math.floor(limitRaw)))
        : 200

    const pg: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    try {
        const result = await pg.raw(
            `SELECT id,
                    display_id,
                    created_at,
                    customer_id,
                    total,
                    currency_code,
                    metadata
               FROM "order"
              WHERE deleted_at IS NULL
                AND canceled_at IS NULL
                AND created_at >= ?::timestamptz
                AND created_at <= ?::timestamptz
              ORDER BY created_at DESC
              LIMIT ?`,
            [from, to, limit],
        )
        const rows = Array.isArray(result?.rows) ? result.rows : result
        if (!Array.isArray(rows)) return res.json({ entries: [], count: 0 })

        const out: AuditRow[] = []
        for (const r of rows) {
            const audit =
                (r.metadata &&
                    typeof r.metadata === "object" &&
                    (r.metadata as any).stamp_duty_audit) ||
                {}
            const complete = isComplete(audit)
            if (missingOnly && complete) continue
            out.push({
                order_id: r.id,
                display_id:
                    typeof r.display_id === "number" ? r.display_id : null,
                created_at:
                    typeof r.created_at === "string"
                        ? r.created_at
                        : new Date(r.created_at).toISOString(),
                customer_id:
                    typeof r.customer_id === "string" ? r.customer_id : null,
                total_paise: Number(r.total) || 0,
                currency_code:
                    typeof r.currency_code === "string"
                        ? r.currency_code
                        : null,
                audit: {
                    dis_initiated_at: audit.dis_initiated_at ?? null,
                    dis_completed_at: audit.dis_completed_at ?? null,
                    consideration_paise:
                        typeof audit.consideration_paise === "number"
                            ? audit.consideration_paise
                            : null,
                    stamp_duty_paise:
                        typeof audit.stamp_duty_paise === "number"
                            ? audit.stamp_duty_paise
                            : null,
                    remittance_ref: audit.remittance_ref ?? null,
                    remitted_on: audit.remitted_on ?? null,
                    state_code: audit.state_code ?? null,
                    counterparty_dp: audit.counterparty_dp ?? null,
                    notes: audit.notes ?? null,
                    updated_by: audit.updated_by ?? null,
                    updated_at: audit.updated_at ?? null,
                },
                is_complete: complete,
            })
        }

        return res.json({ entries: out, count: out.length })
    } catch (err: any) {
        console.error(
            "[admin/orders/stamp-duty-audit GET] failed:",
            err?.message,
        )
        return res.status(500).json({ message: "lookup failed" })
    }
}
