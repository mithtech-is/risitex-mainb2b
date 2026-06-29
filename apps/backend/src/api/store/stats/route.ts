import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
    Modules,
    ContainerRegistrationKeys,
} from "@medusajs/framework/utils"

/**
 * GET /store/stats
 *
 * Public marketing stats for the homepage StatsStrip + other
 * social-proof surfaces. Computed via the Customer / Product / Order
 * modules, with a 10-minute in-memory cache so a homepage that
 * fetches this on every render doesn't hammer the DB.
 *
 * Conservative fallbacks ensure the endpoint never returns less
 * impressive numbers than the hardcoded marketing floors — a cold
 * DB or a bad count would otherwise tank the hero's social proof.
 */

type StatsPayload = {
    amount_invested_inr: number
    investor_count: number
    shares_available: number
    avg_settlement_days: number
    generated_at: string
}

/** Marketing floors — never under-report below these. */
const FLOORS: Pick<
    StatsPayload,
    "amount_invested_inr" | "investor_count" | "shares_available"
> = {
    amount_invested_inr: 42_00_00_000, // ₹42 Cr
    investor_count: 2_400,
    shares_available: 200,
}

/** In-memory cache — fine at a single-node scale; when we scale out,
 *  lift this into Redis via the event-bus module. */
let cache: { payload: StatsPayload; expires: number } | null = null
const CACHE_TTL_MS = 10 * 60 * 1000

async function computeStats(req: MedusaRequest): Promise<StatsPayload> {
    const productModule: any = req.scope.resolve(Modules.PRODUCT)
    const customerModule: any = req.scope.resolve(Modules.CUSTOMER)

    let shares_available = FLOORS.shares_available
    try {
        const [, count] = await productModule.listAndCountProducts(
            { status: "published" },
            { take: 1 },
        )
        shares_available = Math.max(FLOORS.shares_available, count ?? 0)
    } catch {}

    let investor_count = FLOORS.investor_count
    try {
        const [, count] = await customerModule.listAndCountCustomers(
            { has_account: true },
            { take: 1 },
        )
        investor_count = Math.max(FLOORS.investor_count, count ?? 0)
    } catch {}

    // Sum of order totals (rupees). Use raw SQL via the pg connection —
    // faster than pulling every order through the ORM. Two prior bugs
    // here, both silent:
    //   1. Selecting `o.total` threw `column "total" does not exist` —
    //      Medusa v2 stores order totals in `order_summary.totals` JSONB,
    //      not a column on `order`. Fixed by joining order_summary and
    //      reading `totals->>'current_order_total'`.
    //   2. The old code then divided the result by 100 thinking it was
    //      paise. Medusa v2's current_order_total is in MAJOR units
    //      (rupees) — confirmed by sampling: 5 × ₹2025 NSE order has
    //      `current_order_total = 10125`. Removed the / 100.
    let amount_invested_inr = FLOORS.amount_invested_inr
    try {
        const pg: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
        if (pg?.raw) {
            const result = await pg.raw(
                `SELECT COALESCE(SUM((os.totals->>'current_order_total')::numeric), 0) AS total
                   FROM "order" o
                   LEFT JOIN order_summary os ON os.order_id = o.id AND os.deleted_at IS NULL
                  WHERE o.status NOT IN ('canceled','archived')
                    AND o.deleted_at IS NULL`,
            )
            const rows = Array.isArray(result?.rows) ? result.rows : result
            const rawTotalRupees = Number(rows?.[0]?.total ?? 0)
            amount_invested_inr = Math.max(
                FLOORS.amount_invested_inr,
                Math.round(rawTotalRupees),
            )
        }
    } catch {}

    return {
        amount_invested_inr,
        investor_count,
        shares_available,
        avg_settlement_days: 2,
        generated_at: new Date().toISOString(),
    }
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const now = Date.now()
        if (cache && cache.expires > now) {
            return res.json(cache.payload)
        }
        const payload = await computeStats(req)
        cache = { payload, expires: now + CACHE_TTL_MS }

        // Let the CDN + storefront each cache for 5 minutes.
        res.setHeader(
            "Cache-Control",
            "public, s-maxage=300, stale-while-revalidate=600",
        )
        return res.json(payload)
    } catch (err: any) {
        console.error("[store/stats] GET failed:", err)
        return res.json({
            ...FLOORS,
            avg_settlement_days: 2,
            generated_at: new Date().toISOString(),
        } as StatsPayload)
    }
}
