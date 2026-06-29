import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /store/activity/recent-public?limit=10
 *
 * Sitewide "recent activity" feed — a cross-product version of the
 * per-product `/last-order-public` endpoint used on the share-detail
 * page. Feeds the homepage hero's live-purchase ticker.
 *
 * Privacy rules (same as the single-product variant):
 *   - Anonymized: no customer id / email / name / phone / full
 *     address leaves this route.
 *   - City only, defaulting to "India". No state / PIN.
 *   - Amount rounded to nearest ₹5,000 so per-txn value can't be
 *     mined from repeated hits.
 *   - Orders older than 30 days are dropped — stale social-proof is
 *     worse than none.
 *   - No price per share, no share quantity — the signal is "someone
 *     bought something", not "what's the break-up of that order".
 *
 * Caching: 60 s `Cache-Control` because this is a sitewide strip that
 * every landing-page request would otherwise hammer. 60 s is short
 * enough for the "live" feel and long enough to absorb traffic spikes.
 */

type Entry = {
    when_ago: string
    amount_inr_approx: string | null
    city: string | null
    company_name: string | null
    company_handle: string | null
}

type Payload = {
    entries: Entry[]
    has_any: boolean
}

const EMPTY: Payload = { entries: [], has_any: false }

function humanizeAge(ms: number): string | null {
    const min = Math.floor(ms / 60_000)
    if (min < 5) return "just now"
    if (min < 60) return `${min} minutes ago`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} ${hr === 1 ? "hour" : "hours"} ago`
    const d = Math.floor(hr / 24)
    if (d <= 30) return `${d} ${d === 1 ? "day" : "days"} ago`
    return null
}

function roundInr(amountPaise: number): string {
    const rupees = Math.max(0, Math.round(amountPaise / 100))
    if (rupees < 100) return `₹${rupees}`
    const step = 5_000
    const rounded = Math.max(step, Math.round(rupees / step) * step)
    if (rounded >= 1_00_000) {
        const lakhs = rounded / 1_00_000
        return `₹${lakhs.toFixed(lakhs >= 10 ? 0 : 1).replace(/\.0$/, "")} L`
    }
    return `₹${rounded.toLocaleString("en-IN")}`
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    const limitRaw = Number(req.query?.limit)
    const limit = Number.isFinite(limitRaw)
        ? Math.min(20, Math.max(1, Math.floor(limitRaw)))
        : 10

    res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300",
    )

    let pg: any
    try {
        pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    } catch {
        return res.json(EMPTY)
    }
    if (!pg || typeof pg.raw !== "function") return res.json(EMPTY)

    try {
        // DISTINCT ON (product_id) → one row per product, keyed to the
        // most-recent order for that product. That way 10 purchases of
        // PharmEasy in the last hour still collapse to 1 entry, so the
        // ticker reads as a feed of *different* companies instead of a
        // "spam bought X 10 times" strip.
        // Medusa v2 splits order lines across two tables:
        //   - `order_item`           — order-to-line link (has `item_id`)
        //   - `order_line_item`      — line details incl. `variant_id`
        // Previous query joined `order_item.variant_id` directly, which
        // doesn't exist and threw `column oi.variant_id does not exist`
        // on every hit of the public activity ticker. Fixed 2026-04-21.
        // `order_summary.totals` is a JSONB blob Medusa writes when the
        // order completes. We read `grand_total` for the ticker's
        // approximate amount. If the summary row is missing (e.g. the
        // order is mid-completion), grand_total comes back null and
        // the ticker silently hides the amount.
        //
        // Previously we selected `o.total` directly — that column
        // doesn't exist on Medusa v2's `order` table and every hit of
        // this route threw `column o.total does not exist`. Fixed
        // 2026-04-21.
        const result = await pg.raw(
            `SELECT DISTINCT ON (pv.product_id)
                    o.id,
                    o.created_at,
                    (os.totals->>'current_order_total')::numeric AS total,
                    pv.product_id,
                    p.title AS company_name,
                    p.handle AS company_handle,
                    a.city AS shipping_city,
                    a2.city AS billing_city
               FROM "order" o
               JOIN order_item oi ON oi.order_id = o.id
               JOIN order_line_item oli ON oli.id = oi.item_id
               JOIN product_variant pv ON pv.id = oli.variant_id
               JOIN product p ON p.id = pv.product_id
               LEFT JOIN order_summary os ON os.order_id = o.id AND os.deleted_at IS NULL
               LEFT JOIN "order_address" a ON a.id = o.shipping_address_id
               LEFT JOIN "order_address" a2 ON a2.id = o.billing_address_id
              WHERE o.deleted_at IS NULL
                AND o.canceled_at IS NULL
                AND o.created_at >= now() - interval '30 days'
              ORDER BY pv.product_id, o.created_at DESC
              LIMIT ?`,
            [limit * 3],
        )
        const rows = Array.isArray(result?.rows) ? result.rows : result
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.json(EMPTY)
        }

        // `DISTINCT ON` orders by (product_id, created_at) — re-sort
        // globally by recency and clip to `limit` so newest purchases
        // across ALL products surface at the top.
        const sorted = [...rows].sort(
            (a: any, b: any) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
        )

        const entries: Entry[] = []
        for (const row of sorted) {
            if (entries.length >= limit) break
            const createdAt = new Date(row.created_at)
            const when_ago = humanizeAge(Date.now() - createdAt.getTime())
            if (!when_ago) continue
            const total = Number(row.total) || 0
            const city =
                (typeof row.shipping_city === "string" &&
                    row.shipping_city.trim()) ||
                (typeof row.billing_city === "string" &&
                    row.billing_city.trim()) ||
                null
            entries.push({
                when_ago,
                amount_inr_approx: total > 0 ? roundInr(total) : null,
                city: city || "India",
                company_name:
                    typeof row.company_name === "string"
                        ? row.company_name
                        : null,
                company_handle:
                    typeof row.company_handle === "string"
                        ? row.company_handle
                        : null,
            })
        }

        return res.json({
            entries,
            has_any: entries.length > 0,
        } satisfies Payload)
    } catch (err: any) {
        console.warn(
            "[store/activity/recent-public] lookup failed:",
            err?.message,
        )
        return res.json(EMPTY)
    }
}
