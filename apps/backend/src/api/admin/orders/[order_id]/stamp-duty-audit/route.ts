import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * SEBI / PMLA stamp-duty audit trail — per-order write + read endpoint.
 *
 *   GET   /admin/orders/:order_id/stamp-duty-audit
 *   PATCH /admin/orders/:order_id/stamp-duty-audit
 *
 * SEBI expects a defensible paper trail for every off-market equity
 * transfer: when the DIS was initiated, what the consideration was,
 * how much stamp duty was collected, and the remittance reference
 * from the state's e-stamp portal. Until now these fields lived in
 * ops memory + support emails. This endpoint formalises the trail
 * on `order.metadata.stamp_duty_audit` — a structured JSON subtree
 * so an auditor can pull the record via one admin URL.
 *
 * Shape of the subtree (all fields optional; populated incrementally):
 *   {
 *     dis_initiated_at:   ISO string (DIS / e-DIS slip generated)
 *     dis_completed_at:   ISO string (shares credited to buyer DP)
 *     consideration_paise: integer paise (order line-items total)
 *     stamp_duty_paise:   integer paise (collected from buyer)
 *     remittance_ref:     string (GRAS / state-portal challan id)
 *     remitted_on:        ISO date
 *     state_code:         ISO state code (e.g. "MH", "KA")
 *     counterparty_dp:    string (seller's DP id)
 *     notes:              string (operator free-text, <500 chars)
 *     updated_by:         admin user id
 *     updated_at:         ISO string (set server-side on every PATCH)
 *   }
 */

type AuditFields = {
    dis_initiated_at?: string | null
    dis_completed_at?: string | null
    consideration_paise?: number | null
    stamp_duty_paise?: number | null
    remittance_ref?: string | null
    remitted_on?: string | null
    state_code?: string | null
    counterparty_dp?: string | null
    notes?: string | null
}

const WRITABLE_KEYS: ReadonlyArray<keyof AuditFields> = [
    "dis_initiated_at",
    "dis_completed_at",
    "consideration_paise",
    "stamp_duty_paise",
    "remittance_ref",
    "remitted_on",
    "state_code",
    "counterparty_dp",
    "notes",
]

function parseIso(s: unknown): string | null | undefined {
    if (s === null) return null
    if (typeof s !== "string") return undefined
    const t = Date.parse(s)
    if (!Number.isFinite(t)) return undefined
    return new Date(t).toISOString()
}

function parsePaise(n: unknown): number | null | undefined {
    if (n === null) return null
    if (typeof n !== "number" || !Number.isFinite(n)) return undefined
    const i = Math.round(n)
    if (i < 0 || i > 1e15) return undefined
    return i
}

function parseShortString(
    s: unknown,
    maxLen: number,
): string | null | undefined {
    if (s === null) return null
    if (typeof s !== "string") return undefined
    const trimmed = s.trim()
    if (trimmed.length === 0) return null
    if (trimmed.length > maxLen) return undefined
    return trimmed
}

function sanitizeInput(body: any): Partial<AuditFields> {
    const out: Partial<AuditFields> = {}
    for (const k of WRITABLE_KEYS) {
        if (!(k in body)) continue
        const v = body[k]
        let parsed: unknown
        if (k === "dis_initiated_at" || k === "dis_completed_at") {
            parsed = parseIso(v)
        } else if (k === "consideration_paise" || k === "stamp_duty_paise") {
            parsed = parsePaise(v)
        } else if (k === "remitted_on") {
            parsed = parseIso(v)
        } else if (k === "state_code") {
            parsed = parseShortString(v, 8)
        } else if (k === "notes") {
            parsed = parseShortString(v, 500)
        } else {
            parsed = parseShortString(v, 120)
        }
        // `undefined` means the payload contained a malformed value —
        // swallow silently so partial writes still go through. Callers
        // can inspect the GET response to confirm what was saved.
        if (parsed === undefined) continue
        ;(out as any)[k] = parsed
    }
    return out
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    const orderId = req.params.order_id as string
    if (!orderId) return res.status(400).json({ message: "missing order_id" })

    const pg: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    try {
        const r = await pg.raw(
            `SELECT id,
                    display_id,
                    created_at,
                    customer_id,
                    total,
                    currency_code,
                    metadata
               FROM "order"
              WHERE id = ?
                AND deleted_at IS NULL
              LIMIT 1`,
            [orderId],
        )
        const row = (r?.rows ?? r)?.[0]
        if (!row) return res.status(404).json({ message: "order not found" })

        const audit =
            (row.metadata &&
                typeof row.metadata === "object" &&
                (row.metadata as any).stamp_duty_audit) ||
            {}

        return res.json({
            order_id: row.id,
            display_id: row.display_id,
            created_at: row.created_at,
            customer_id: row.customer_id,
            total_paise: Number(row.total) || 0,
            currency_code: row.currency_code,
            audit,
        })
    } catch (err: any) {
        console.error(
            "[admin/orders/:id/stamp-duty-audit GET] failed:",
            err?.message,
        )
        return res.status(500).json({ message: "lookup failed" })
    }
}

export const PATCH = async (req: MedusaRequest, res: MedusaResponse) => {
    const orderId = req.params.order_id as string
    if (!orderId) return res.status(400).json({ message: "missing order_id" })

    const body = (req.body as any) || {}
    const patch = sanitizeInput(body)
    if (Object.keys(patch).length === 0) {
        return res.status(400).json({
            message:
                "no writable fields provided — expected one of: " +
                WRITABLE_KEYS.join(", "),
        })
    }

    const actor =
        (req as any).session?.user_id ||
        (req as any).user?.id ||
        (req as any).actor_id ||
        "admin"

    // Merge patch onto existing metadata.stamp_duty_audit with
    // `jsonb_set` twice: once to scope under the subtree key, once
    // to add the updated_by / updated_at audit fields.
    const pg: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    try {
        // Read-merge-write because jsonb_set can't do a partial merge
        // of two jsonb objects in a single call on all Postgres
        // versions we support. Race between admins on the same order
        // is acceptable — last-write-wins matches the current ops
        // flow (one compliance officer per order).
        const cur = await pg.raw(
            `SELECT metadata FROM "order" WHERE id = ? LIMIT 1`,
            [orderId],
        )
        const row = (cur?.rows ?? cur)?.[0]
        if (!row) return res.status(404).json({ message: "order not found" })

        const existingAudit =
            (row.metadata &&
                typeof row.metadata === "object" &&
                (row.metadata as any).stamp_duty_audit) ||
            {}
        const merged = {
            ...existingAudit,
            ...patch,
            updated_by: actor,
            updated_at: new Date().toISOString(),
        }

        await pg.raw(
            `UPDATE "order"
                SET metadata = jsonb_set(
                        COALESCE(metadata, '{}'::jsonb),
                        ARRAY['stamp_duty_audit'],
                        ?::jsonb,
                        true
                    )
              WHERE id = ?`,
            [JSON.stringify(merged), orderId],
        )

        return res.json({ ok: true, audit: merged })
    } catch (err: any) {
        console.error(
            "[admin/orders/:id/stamp-duty-audit PATCH] failed:",
            err?.message,
        )
        return res.status(500).json({ message: "update failed" })
    }
}
