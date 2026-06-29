import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /store/products/:id/last-order-public
 *
 * Returns an anonymized summary of the most recent completed purchase
 * of this product, for display as "social proof" on the share detail
 * page ("Last purchase: 3 hours ago · ₹1.25L · investor from Bangalore").
 *
 * Privacy rules:
 *   - NEVER return customer id, email, name, phone, full address.
 *   - City only (or "India" fallback). No state, no PIN.
 *   - Amount is rounded to the nearest ₹5,000 so the per-transaction
 *     value can't be mined from repeated hits.
 *   - Orders older than 30 days return null — "no recent purchase"
 *     is more honest than a stale signal.
 *
 * Caching: 5-minute `Cache-Control` to blunt scraping attempts.
 */

type Payload = {
    when_ago: string | null
    amount_inr_approx: string | null
    city: string | null
    has_recent: boolean
}

const EMPTY: Payload = {
    when_ago: null,
    amount_inr_approx: null,
    city: null,
    has_recent: false,
}

/** Relative-time label (server-side — no user locale). */
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

/** Round to nearest ₹5,000 to prevent inference of the exact order. */
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
    const productId = req.params.id as string
    res.setHeader(
        "Cache-Control",
        "public, s-maxage=300, stale-while-revalidate=900",
    )
    if (!productId) return res.json(EMPTY)

    let pg: any
    try {
        pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    } catch {
        return res.json(EMPTY)
    }
    if (!pg || typeof pg.raw !== "function") return res.json(EMPTY)

    try {
        // Join order → order_item → order_line_item → variant → product.
        // Medusa v2 splits the order-line data: `order_item` is the
        // order-to-line link (has `item_id`), `order_line_item` has
        // the actual details including `variant_id`. The old query
        // joined `order_item.variant_id` which doesn't exist; fixed
        // 2026-04-21.
        // `order_summary.totals` holds the JSONB total. Medusa v2's
        // `order` table has no `total` column directly — selecting
        // `o.total` throws "column o.total does not exist". Fixed
        // 2026-04-21.
        const result = await pg.raw(
            `SELECT o.id,
                    o.created_at,
                    (os.totals->>'current_order_total')::numeric AS total,
                    o.currency_code,
                    a.city AS shipping_city,
                    a2.city AS billing_city
               FROM "order" o
               JOIN order_item oi ON oi.order_id = o.id
               JOIN order_line_item oli ON oli.id = oi.item_id
               JOIN product_variant pv ON pv.id = oli.variant_id
               LEFT JOIN order_summary os ON os.order_id = o.id AND os.deleted_at IS NULL
               LEFT JOIN "order_address" a ON a.id = o.shipping_address_id
               LEFT JOIN "order_address" a2 ON a2.id = o.billing_address_id
              WHERE pv.product_id = ?
                AND o.deleted_at IS NULL
                AND o.canceled_at IS NULL
                AND o.created_at >= now() - interval '30 days'
              ORDER BY o.created_at DESC
              LIMIT 1`,
            [productId],
        )
        const rows = Array.isArray(result?.rows) ? result.rows : result
        const row = rows?.[0]
        if (!row) return res.json(EMPTY)

        const createdAt = new Date(row.created_at)
        const ageMs = Date.now() - createdAt.getTime()
        const when_ago = humanizeAge(ageMs)
        if (!when_ago) return res.json(EMPTY)

        const total = Number(row.total) || 0
        const city =
            (typeof row.shipping_city === "string" && row.shipping_city.trim()) ||
            (typeof row.billing_city === "string" && row.billing_city.trim()) ||
            null

        return res.json({
            when_ago,
            amount_inr_approx: total > 0 ? roundInr(total) : null,
            city: city || "India",
            has_recent: true,
        } satisfies Payload)
    } catch (err: any) {
        console.warn(
            "[store/products/:id/last-order-public] lookup failed:",
            err?.message,
        )
        return res.json(EMPTY)
    }
}
