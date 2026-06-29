/**
 * Wallet → ERPNext push subscriber.
 *
 * Separate from the generic mapping-driven forwarder
 * (subscribers/erpnext-forward.ts) because wallet transactions need
 * domain-specific handling that the generic mapping engine can't express
 * cleanly:
 *
 *   - Only MAIN-bucket transactions sync. Promo-bucket rows (discounts,
 *     referral credits) are NEVER mirrored to ERPNext — the Frappe
 *     side has no concept of promo balance; it'd just be noise. Promo
 *     usage shows up later as a discount on the related Security Sale.
 *
 *   - Each wallet kind maps to a different Frappe event:
 *       kind=vba_credit           → wallet.deposit.captured
 *       kind=manual_adjust (Credit)→ wallet.deposit.captured (source=manual)
 *       kind=refund               → wallet.deposit.captured (source=manual)
 *       direction=debit (any kind)→ wallet.withdrawal.posted
 *
 *   - The payload shape matches what the Frappe `polemarch.api.medusa_webhook`
 *     dispatcher expects. The receiver dispatches to the wallet_sync API
 *     which posts the Wallet Deposit + side-fee JE atomically.
 *
 *   - The `customer` field in the payload is the FRAPPE Customer name
 *     (e.g. "MANOJ MITHAJAL BHAT"), NOT the Medusa customer id. We
 *     resolve it here by looking up the Frappe Customer whose
 *     `email_id` matches the Medusa customer.email. Reason: the
 *     Frappe `record_deposit` API does `frappe.db.exists("Customer",
 *     customer)`, which only matches by Customer name. Without the
 *     resolution, the Frappe side would reject the deposit with
 *     "Customer cus_xxx does not exist".
 *
 *     If the Medusa customer doesn't exist on Frappe yet (e.g. never
 *     KYC-approved, or just been deleted on Frappe and not yet
 *     restored by the reconciliation cron), we SKIP the push silently
 *     — the wallet transaction stays Medusa-only until the customer
 *     mapping catches up. The hourly customer-recovery cron will
 *     restore the Frappe Customer; the next wallet event re-tries.
 */

import type {
    SubscriberArgs,
    SubscriberConfig,
} from "@medusajs/framework/subscribers"
import { Modules } from "@medusajs/framework/utils"
import { ERPNEXT_MODULE } from "../modules/erpnext"

type WalletTx = {
    id: string
    wallet_id: string
    customer_id: string
    direction: "credit" | "debit"
    amount_inr: number // in paise, ABS value (sign is in `direction`)
    bucket: "main" | "promo"
    kind: string
    reference_type?: string
    reference_id?: string
    idempotency_key: string
    cashfree_event_id?: string
    note?: string
    created_at?: string
}

export default async function walletForwardHandler({
    event,
    container,
}: SubscriberArgs<any>) {
    const eventName = event?.name as string | undefined
    const txId = event?.data?.id as string | undefined
    const eventId = (event as any)?.id as string

    if (!eventName || !txId) return

    // Only handle wallet transaction events. Other wallet events
    // (wallet.created, wallet.updated) are entity-level and don't
    // need a Frappe-side action — wallets are created lazily on the
    // Frappe side when the customer's first transaction lands.
    if (eventName !== "wallet_transaction.created") return

    let walletModule: any
    let erpnext: any
    try {
        walletModule = container.resolve("cashfree_wallet")
        erpnext = container.resolve(ERPNEXT_MODULE)
    } catch {
        // Either module not installed in this Medusa deployment. Skip.
        return
    }

    const [tx]: [WalletTx | undefined] = await walletModule.listWalletTransactions(
        { id: txId },
        { take: 1 },
    )
    if (!tx) return

    // 1) Promo-bucket — never sync.
    if (tx.bucket === "promo") return

    // 2) Map kind/direction → Frappe event + source.
    const { event: frappeEvent, source } = classifyTransaction(tx)
    if (!frappeEvent) return // unsupported kind, skip silently

    // 3) Resolve the FRAPPE Customer name by email lookup. The Frappe
    //    `record_deposit` API matches `customer` against Customer.name,
    //    not metadata.medusa_id, so we must translate before pushing.
    const frappeCustomerName = await resolveFrappeCustomerName(
        container,
        erpnext,
        tx.customer_id,
    )
    if (!frappeCustomerName) {
        console.warn(
            `[erpnext-forward-wallet] skip ${tx.id}: no Frappe Customer ` +
                `matches Medusa customer ${tx.customer_id} (not yet synced ` +
                `to Frappe, or recently deleted there).`,
        )
        return
    }

    // 4) Compose payload. Frappe expects amount in RUPEES, not paise.
    const amountRupees = Math.abs(tx.amount_inr) / 100

    const data: Record<string, unknown> = {
        customer: frappeCustomerName,
        amount: amountRupees,
        gateway_ref: tx.cashfree_event_id || tx.idempotency_key,
        source,
        remarks: tx.note || `Medusa wallet_transaction ${tx.id}`,
        // Pass-through metadata for the Frappe-side audit log.
        medusa_wallet_transaction_id: tx.id,
        medusa_customer_id: tx.customer_id,
        medusa_kind: tx.kind,
    }

    // 5) Forward via the existing service (HMAC + retry + event log).
    await erpnext.forwardEvent({
        event: frappeEvent,
        event_id: eventId || tx.id,
        data,
    })
}


/**
 * Look up the Frappe Customer name for a Medusa customer id.
 *
 * Three-tier resolution chain (cheapest first):
 *   1) `customer.metadata.frappe_customer_name` — stamped on Frappe→
 *      Medusa pull (see modules/erpnext/index.ts _handleCustomerUpserted).
 *      Free in-memory hit if available.
 *   2) Frappe REST query by `email_id`. One network round-trip; the
 *      result is NOT cached because wallet activity is rare enough
 *      that a fresh check is cheaper than dealing with stale cache.
 *   3) Returns null when neither lookup yields a match. Caller decides
 *      whether to skip or surface.
 */
async function resolveFrappeCustomerName(
    container: any,
    erpnext: any,
    medusaCustomerId: string,
): Promise<string | null> {
    let customerModule: any
    try {
        customerModule = container.resolve(Modules.CUSTOMER)
    } catch {
        return null
    }
    const customer = await customerModule
        .retrieveCustomer(medusaCustomerId)
        .catch(() => null)
    if (!customer) return null

    const stamped = (
        customer.metadata as Record<string, unknown> | null | undefined
    )?.frappe_customer_name
    if (stamped && typeof stamped === "string" && stamped.trim()) {
        return stamped.trim()
    }

    if (!customer.email) return null

    try {
        const cfg = await erpnext.getActiveConfig()
        const creds = await erpnext.getApiCredentials()
        if (!cfg.erpnext_url || !creds.api_key || !creds.api_secret) {
            return null
        }
        const filtersJson = encodeURIComponent(
            JSON.stringify([["email_id", "=", customer.email]]),
        )
        const fieldsJson = encodeURIComponent(JSON.stringify(["name"]))
        const url = `${cfg.erpnext_url}/api/resource/Customer?fields=${fieldsJson}&filters=${filtersJson}&limit_page_length=1`
        const res = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `token ${creds.api_key}:${creds.api_secret}`,
            },
            signal: AbortSignal.timeout(cfg.request_timeout_ms ?? 30000),
        })
        if (!res.ok) return null
        const body = await res.json().catch(() => ({}))
        const row = body?.data?.[0]
        return row?.name ?? null
    } catch {
        return null
    }
}


function classifyTransaction(tx: WalletTx): {
    event: string | null
    source: string
} {
    if (tx.direction === "credit") {
        switch (tx.kind) {
            case "vba_credit":
                return { event: "wallet.deposit.captured", source: "cashfree" }
            case "manual_adjust":
                return { event: "wallet.deposit.captured", source: "manual" }
            case "refund":
            case "order_reversal":
                return { event: "wallet.deposit.captured", source: "manual" }
            case "referral_credit":
            case "points_conversion":
                // These hit the promo bucket usually; if they ever land
                // on main, they're effectively a "free deposit" — book
                // as a manual deposit (no Cashfree fee).
                return { event: "wallet.deposit.captured", source: "manual" }
            default:
                return { event: null, source: "manual" }
        }
    } else {
        // Debit
        switch (tx.kind) {
            case "order_debit":
                // Order-driven debit. These are settled at order time
                // via the Security Sale flow, NOT via a standalone
                // wallet withdrawal. The Security Sale's
                // _post_wallet_transaction handles the wallet effect
                // on the Frappe side. So we skip these here.
                return { event: null, source: "manual" }
            case "manual_adjust":
                return { event: "wallet.withdrawal.posted", source: "manual" }
            default:
                return { event: null, source: "manual" }
        }
    }
}


export const config: SubscriberConfig = {
    event: ["wallet_transaction.created"],
}
