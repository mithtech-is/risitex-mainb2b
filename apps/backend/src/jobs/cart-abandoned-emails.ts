import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { withHeartbeat } from "../utils/job-heartbeat"
import { sendEventEmail } from "../modules/polemarch_communication/helpers/send-event-email"

/**
 * Abandoned-cart nudge job.
 *
 * Runs hourly, looks at carts that:
 *   - have at least one item,
 *   - are tied to a customer with an email on file,
 *   - aren't yet paid / completed / deleted,
 *   - have been idle long enough to qualify for a specific tier,
 *   - haven't already received THAT tier's email.
 *
 * Four nudges fire in sequence as a cart keeps getting ignored:
 *
 *   Tier      Window (cart idle time)                Event
 *   ──────────────────────────────────────────────────────────────────
 *   1h        1 h   → 1 d                            cart.abandoned_1h
 *   1d        1 d   → 7 d                            cart.abandoned_1d
 *   7d        7 d   → 30 d                           cart.abandoned_7d
 *   30d       30 d  → 90 d                           cart.abandoned_30d
 *
 * Each tier is independent: a cart idle for >30 d will have received
 * all four emails in sequence as it aged. Delivery is idempotent via
 * a per-cart metadata flag (`abandoned_email_<tier>_at`) so the same
 * email never goes twice. After 90 d the cart is dropped from the
 * sweep entirely — if someone's been sitting on the same cart for
 * 3 months, another email isn't going to help.
 *
 * Email content lives in the polemarch_communication module's seed templates
 * (`cart.abandoned_1h` / `_1d` / `_7d` / `_30d`) so ops can tune copy
 * from the admin Emails tab without a redeploy.
 */

type CartRow = {
    cart_id: string
    customer_id: string
    email: string
    first_name: string | null
    item_count: number
    total_paise: number
    updated_at: string
    metadata: Record<string, unknown> | null
    first_item_name: string | null
    first_item_handle: string | null
}

// Query once per tier — keeps SQL simple and the email provider happy
// (100 sends/run is a safe upper bound; the query LIMITs to that).
async function loadCandidates(
    pg: any,
    windowStart: string,
    windowEnd: string,
    metadataFlagKey: string,
    limit = 100,
): Promise<CartRow[]> {
    // NOTE on the `->>` check: we used to write this as
    //   `NOT (c.metadata ? ?)`
    // which reads nicely (PostgreSQL's jsonb "key-exists" operator)
    // but knex's positional-binding parser counts the `?` OPERATOR as
    // a placeholder too — so it saw 5 placeholders against 4 bindings
    // and threw `Expected 4 bindings, saw 5` at every run. Using
    // `metadata->>key IS NULL` dodges the ambiguity (the `->>` operator
    // is two characters, so knex doesn't misread it) and is logically
    // identical: the flag key is absent iff `metadata->>key` returns
    // NULL.
    const result = await pg.raw(
        `SELECT c.id AS cart_id,
                c.customer_id,
                cu.email,
                cu.first_name,
                c.updated_at,
                c.metadata,
                COUNT(ci.id) AS item_count,
                COALESCE(SUM(ci.unit_price * ci.quantity), 0)::bigint AS total_paise,
                (ARRAY_AGG(ci.product_title ORDER BY ci.created_at DESC))[1] AS first_item_name,
                (ARRAY_AGG(ci.product_handle ORDER BY ci.created_at DESC))[1] AS first_item_handle
           FROM cart c
           JOIN customer cu ON cu.id = c.customer_id
           JOIN cart_line_item ci ON ci.cart_id = c.id
          WHERE c.deleted_at IS NULL
            AND c.completed_at IS NULL
            AND cu.has_account = TRUE
            AND cu.email IS NOT NULL
            AND c.updated_at BETWEEN ?::timestamptz AND ?::timestamptz
            AND (c.metadata IS NULL OR c.metadata->>? IS NULL)
          GROUP BY c.id, cu.email, cu.first_name
          HAVING COUNT(ci.id) > 0
          ORDER BY c.updated_at ASC
          LIMIT ?`,
        [windowStart, windowEnd, metadataFlagKey, limit],
    )
    const rows = Array.isArray(result?.rows) ? result.rows : result
    return Array.isArray(rows) ? (rows as CartRow[]) : []
}

/** Merge a flag into the cart's `metadata` JSON without clobbering
 *  the rest of it. Uses PG's `jsonb_set` so concurrent writers
 *  (checkout flow, admin edits) don't race-lose their own keys. */
async function stampSent(
    pg: any,
    cartId: string,
    metadataFlagKey: string,
): Promise<void> {
    await pg.raw(
        `UPDATE cart
            SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb),
                                     ARRAY[?],
                                     to_jsonb(now()::text),
                                     true),
                updated_at = updated_at -- do NOT bump updated_at
          WHERE id = ?`,
        [metadataFlagKey, cartId],
    )
}

function rupees(paise: number): string {
    const rs = Math.max(0, Math.round(paise / 100))
    if (rs >= 1_00_000) {
        const lakhs = rs / 1_00_000
        return `₹${lakhs.toFixed(lakhs >= 10 ? 0 : 1).replace(/\.0$/, "")} L`
    }
    return `₹${rs.toLocaleString("en-IN")}`
}

/**
 * Per-tier configuration. `minIdleH` is "how long must the cart have
 * been idle to qualify"; `maxIdleH` is "drop carts older than this so
 * we don't spam long-dormant accounts". Tier windows deliberately
 * overlap the following tier's lower bound so nothing falls through
 * the cracks if the job misses a run.
 */
type Tier = "1h" | "1d" | "7d" | "30d"
const TIERS: Record<Tier, {
    minIdleH: number
    maxIdleH: number
    flag: string
    eventName: string
}> = {
    "1h":  { minIdleH:  1,   maxIdleH: 24,       flag: "abandoned_email_1h_at",  eventName: "cart.abandoned_1h"  },
    "1d":  { minIdleH: 24,   maxIdleH: 7 * 24,   flag: "abandoned_email_1d_at",  eventName: "cart.abandoned_1d"  },
    "7d":  { minIdleH: 7*24, maxIdleH: 30 * 24,  flag: "abandoned_email_7d_at",  eventName: "cart.abandoned_7d"  },
    "30d": { minIdleH: 30*24,maxIdleH: 90 * 24,  flag: "abandoned_email_30d_at", eventName: "cart.abandoned_30d" },
}

async function runTier(
    container: MedusaContainer,
    pg: any,
    tier: Tier,
): Promise<{ sent: number; skipped: number }> {
    const now = Date.now()
    const hr = 60 * 60 * 1000
    const { minIdleH, maxIdleH, flag, eventName } = TIERS[tier]
    // Cart counts as "in window" if updated_at is between
    //   (now - maxIdleH) .. (now - minIdleH)
    // i.e. idle for at least `minIdleH` hours but no longer than
    // `maxIdleH` — the next tier up takes carts older than that.
    const windowStartMs = now - maxIdleH * hr
    const windowEndMs   = now - minIdleH * hr

    const candidates = await loadCandidates(
        pg,
        new Date(windowStartMs).toISOString(),
        new Date(windowEndMs).toISOString(),
        flag,
    )
    let sent = 0
    let skipped = 0

    for (const row of candidates) {
        try {
            const storefront =
                process.env.STOREFRONT_URL || "https://risitex.com"
            await sendEventEmail(container, eventName, {
                customer_id: row.customer_id,
                cart_id: row.cart_id,
                item_count: Number(row.item_count) || 0,
                total_display: rupees(Number(row.total_paise) || 0),
                first_item_name: row.first_item_name ?? "your share",
                first_item_handle: row.first_item_handle ?? "",
                resume_url: row.first_item_handle
                    ? `${storefront}/invest/${row.first_item_handle}`
                    : `${storefront}/cart`,
                cart_url: `${storefront}/cart`,
                first_name: row.first_name ?? "",
            })
            await stampSent(pg, row.cart_id, flag)
            sent += 1
        } catch (err: any) {
            console.warn(
                `[cart-abandoned-emails] tier=${tier} cart=${row.cart_id} failed:`,
                err?.message,
            )
            skipped += 1
        }
    }
    return { sent, skipped }
}

export default async function cartAbandonedEmails(container: MedusaContainer) {
    await withHeartbeat(
        container,
        "cart-abandoned-emails",
        config,
        async () => {
            let pg: any
            try {
                pg = container.resolve(
                    ContainerRegistrationKeys.PG_CONNECTION,
                )
            } catch {
                return
            }
            if (!pg || typeof pg.raw !== "function") return

            const results: Record<Tier, { sent: number; skipped: number }> = {
                "1h":  await runTier(container, pg, "1h"),
                "1d":  await runTier(container, pg, "1d"),
                "7d":  await runTier(container, pg, "7d"),
                "30d": await runTier(container, pg, "30d"),
            }
            const total = Object.values(results).reduce((n, r) => n + r.sent, 0)
            if (total > 0) {
                const summary = (Object.entries(results) as [Tier, { sent: number; skipped: number }][])
                    .map(([t, r]) => `${t} sent=${r.sent} skipped=${r.skipped}`)
                    .join(" | ")
                console.log(`[cart-abandoned-emails] ${summary}`)
            }
        },
    )
}

export const config = {
    name: "cart-abandoned-emails",
    // Hourly on the hour. Cart-abandoned windows are day-scale (48 h
    // and 7 d), so a minute-level sweep wastes DB hits + inbox share.
    // Email burst bounded by LIMIT 100 per tier per run = 200/hr
    // absolute ceiling — comfortably below any provider's rate limit.
    schedule: "0 * * * *",
}
