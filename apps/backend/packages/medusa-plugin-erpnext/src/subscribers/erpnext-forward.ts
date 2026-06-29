import type {
    SubscriberArgs,
    SubscriberConfig,
} from "@medusajs/framework/subscribers"
import { ERPNEXT_MODULE } from "../modules/erpnext"
import { getMedusaEntity, listMedusaEntities } from "../modules/erpnext/registry"

/**
 * Mapping-driven Medusa → ERPNext forwarder.
 *
 * Lifecycle per event:
 *   1. Match the event name against the static event-registry to find
 *      the corresponding Medusa entity key (customer / order / product
 *      / user). Events that don't map to a registered entity are
 *      dropped silently — the operator can't have configured a mapping
 *      for them anyway.
 *   2. Pull every enabled mapping for that entity whose `events` array
 *      includes this event name (and whose direction is push or both).
 *   3. Fetch the enriched record once via the entity's registry
 *      `fetchById` adapter — shared across all mappings on the same
 *      entity so we don't re-fetch the customer/order N times.
 *   4. For each mapping: call `pushViaMapping` which runs the
 *      transform engine, POSTs the result, and logs into
 *      erpnext_sync_event tagged with mapping_id.
 *
 * Fallback to legacy behaviour:
 *   When NO mapping matches the event AND the event is one of the
 *   historically-wired set (customer.*, order.*), the legacy
 *   `forwardEvent` path runs with the enriched full payload. This
 *   keeps the existing prod behaviour working until operators
 *   migrate to explicit mappings.
 *
 * Backpressure / errors:
 *   Each `pushViaMapping` call is awaited sequentially so a slow
 *   Frappe doesn't fan out N parallel HTTP requests per event. The
 *   service swallows HTTP errors and records them on the per-event
 *   row, so order placement on the storefront is never blocked.
 */
export default async function erpnextForwardHandler({
    event,
    container,
}: SubscriberArgs<any>) {
    const eventName = event?.name as string | undefined
    if (!eventName) return

    // Bank/demat verification events carry `{id, customer_id}` —
    // we want to enrich/push the CUSTOMER, not the bank/demat row.
    // For those events the entityId is `customer_id`; for everything
    // else it's `data.id` as before.
    const isBankOrDematEvent =
        eventName.startsWith("bank_account.") ||
        eventName.startsWith("demat_account.")
    const entityId = isBankOrDematEvent
        ? ((event?.data?.customer_id as string | undefined) ??
            (event?.data?.id as string | undefined))
        : (event?.data?.id as string | undefined)
    // Medusa 2.15 event messages have no top-level `id` — the message
    // shape is { data, name, metadata }. The old Polemarch build relied
    // on `event.id` and skipped every event when it was absent, which
    // silently broke ALL push sync. We only need a STABLE id for the
    // sync-event idempotency key, so synthesize one from the event name
    // + entity id (e.g. "customer.created:cus_123") when the bus doesn't
    // supply its own. Fall back to a metadata id if present.
    const eventId =
        ((event as any)?.id as string | undefined) ??
        ((event?.metadata as Record<string, unknown> | undefined)
            ?.eventGroupId as string | undefined) ??
        (entityId ? `${eventName}:${entityId}` : undefined)
    if (!eventId) {
        console.warn(
            `[erpnext-forward] skipping ${eventName}: no event.id and no entity id to synthesize one`,
        )
        return
    }

    const entityKey = resolveEntityKey(eventName)
    const erpnext: any = container.resolve(ERPNEXT_MODULE)

    let enriched: any = event?.data ?? {}
    let mappings: any[] = []
    if (entityKey) {
        const descriptor = getMedusaEntity(entityKey)
        if (descriptor && entityId) {
            try {
                enriched = (await descriptor.fetchById(container, entityId)) ?? enriched
            } catch (err) {
                console.warn(
                    `[erpnext-forward] enrichment failed for ${eventName}:`,
                    err,
                )
            }
        }
        try {
            mappings = await erpnext.listEnabledPushMappingsForEvent(
                entityKey,
                eventName,
            )
        } catch (err) {
            console.warn(
                `[erpnext-forward] mapping lookup failed for ${eventName}:`,
                err,
            )
        }
    }

    // ── Customer push gate (RISITEX policy) ─────────────────────────
    // RISITEX is textile commerce, not financial services — there's
    // no KYC requirement, so customers sync to ERPNext as soon as they
    // exist (ERPNext is the back-office and wants every customer for
    // accounting / GST). The previous Polemarch gate required
    // `metadata.kyc_fully_approved_at` and blocked ALL non-KYC
    // customers; that's been removed.
    //
    // The ONLY opt-out is an explicit per-customer flag
    // `metadata.skip_erpnext_sync === true` (e.g. internal test
    // accounts an operator never wants in the books). Everyone else
    // syncs.
    //
    // Gates the PUSH only (Medusa → Frappe); Pull runs independently.
    if (eventName.startsWith("customer.")) {
        const optedOut =
            (enriched?.metadata as Record<string, unknown> | undefined)
                ?.skip_erpnext_sync === true
        if (optedOut) {
            console.log(
                `[erpnext-forward] skip ${eventName} (${entityId}): metadata.skip_erpnext_sync = true`,
            )
            return
        }
    }

    if (mappings.length > 0) {
        for (const m of mappings) {
            const result = await erpnext.pushViaMapping({
                mapping: m,
                event: eventName,
                event_id: `${eventId}:${m.id}`,
                record: enriched,
            })
            if (!result.ok) {
                console.error(
                    `[erpnext-forward] ${eventName} via mapping ${m.name} (${m.id}) → ${result.error}`,
                )
            }
        }
        return
    }

    // ── Fallback: no mapping configured for this event.
    // For historically-wired events (customer.*, order.*) keep the
    // legacy full-payload forward so existing prod deployments don't
    // silently stop syncing the moment this rewrite lands. New event
    // types (product.*, user.*) are NOT auto-forwarded — they require
    // an explicit mapping.
    if (
        eventName.startsWith("customer.") ||
        eventName.startsWith("order.") ||
        eventName.startsWith("bank_account.") ||
        eventName.startsWith("demat_account.")
    ) {
        // For bank/demat events, rewrite the outgoing event name to
        // `customer.updated` so the Frappe-side handler (which keys
        // on event name) routes the enriched customer payload through
        // the existing _handle_customer_updated handler. The handler
        // detects bank_accounts[] / demat_accounts[] in the payload
        // and upserts the child rows. Keeps the Frappe API surface
        // narrow — no new handler types just for cashfree-wallet
        // events.
        const wireEventName = isBankOrDematEvent
            ? "customer.updated"
            : eventName
        const result = await erpnext.forwardEvent({
            event: wireEventName,
            event_id: eventId,
            data: enriched,
        })
        if (!result.ok) {
            console.error(
                `[erpnext-forward] ${eventName} → ${wireEventName} (${eventId}) legacy → ${result.error}`,
            )
        }
    }
}

/**
 * Map an event name to the Medusa entity key it concerns. Drives the
 * mapping-lookup query — without this we'd have to ask the database
 * "give me every mapping with this event in its array", which is fine
 * but more expensive than scoping by entity first.
 *
 * Built from the registry so adding a new entity automatically wires
 * up its events as well — no double bookkeeping. Doesn't filter by
 * availability here; the mapping lookup is cheap and any mapping that
 * references an unavailable entity simply finds nothing.
 */
function resolveEntityKey(eventName: string): string | null {
    for (const e of listMedusaEntities()) {
        if (e.events.includes(eventName)) return e.key
    }
    // Also accept any custom event prefix the operator put on the
    // mapping (e.g. `polemarch.kyc.verified`). Fall through and let
    // the mapping lookup figure it out — those don't need
    // pre-enrichment.
    const dotIdx = eventName.indexOf(".")
    if (dotIdx > 0) return eventName.slice(0, dotIdx)
    return null
}

/**
 * Subscribe to every Medusa event a registered entity declares. The
 * resulting array is computed at import time so the framework's
 * subscriber loader sees a static config. Adding an entity to the
 * registry instantly extends this list — no extra wiring.
 */
function buildSubscribedEvents(): string[] {
    const set = new Set<string>()
    for (const e of listMedusaEntities()) {
        for (const ev of e.events) set.add(ev)
    }
    return Array.from(set)
}

export const config: SubscriberConfig = {
    event: buildSubscribedEvents(),
}
