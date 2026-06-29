import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers"
import { Modules } from "@medusajs/framework/utils"
import { sendEventEmail } from "../modules/polemarch_communication/helpers/send-event-email"

/**
 * Routes Medusa order events to two places:
 *   1. `polemarchModule.createNotifications` — the in-app bell dropdown.
 *   2. `sendEventEmail(...)` — the transactional email channel, gated
 *      by the event→template mapping rows seeded in the loader.
 *
 * Email is best-effort: if SMTP is down or the mapping is disabled,
 * the in-app notification still fires and the subscriber returns
 * cleanly.
 */
export default async function notificationHandler({
    event,
    container,
}: SubscriberArgs<any>) {
    try {
        const polemarchModule = container.resolve("polemarch") as any
        const { name, data } = event
        const customerId = data?.customer_id
        const orderId = data?.id

        // ── Enrich the order FIRST so display_id is available for both
        // the in-app notification copy and the email payload. We can't
        // surface "Order #19" in the bell dropdown without this step —
        // the raw event data only carries the ULID.
        const payload: Record<string, any> = {
            customer_id: customerId,
            order: {
                id: orderId,
                display_id: orderId,
                payment_status: data?.payment_status || "",
                placed_at: new Date().toLocaleString("en-IN"),
            },
            total_inr: "",
            amount_inr: "",
            reason: data?.reason || "",
        }

        try {
            const orderModule: any = container.resolve(Modules.ORDER)
            const order = await orderModule.retrieveOrder(orderId, {
                select: ["id", "display_id", "total", "currency_code", "payment_status"],
            })
            if (order) {
                payload.order = {
                    id: order.id,
                    display_id: order.display_id || order.id,
                    payment_status: order.payment_status || "",
                    placed_at: new Date(order.created_at ?? Date.now()).toLocaleString("en-IN"),
                    currency_code: (order.currency_code || "inr").toUpperCase(),
                }
                const totalPaise =
                    typeof order.total === "number"
                        ? order.total
                        : Number.parseFloat(order.total || "0")
                const rupees = Math.round((totalPaise || 0) / 100)
                payload.total_inr = rupees.toLocaleString("en-IN")
                payload.amount_inr = payload.total_inr
            }
        } catch {
            // Enrichment failed — fall through with the minimal payload.
        }

        // Friendly order label for in-app copy. "#19" when we got the
        // display_id, otherwise we just say "your order" to avoid
        // surfacing the raw ULID.
        const displayId = payload.order.display_id
        const orderLabel =
            displayId && displayId !== orderId ? `#${displayId}` : "your order"
        // Deep-link target for the bell row — the customer's order
        // detail page renders the share-transfer timeline + meta.
        const orderLink = orderId ? `/dashboard/orders/${orderId}` : null

        // ── In-app notification: short human copy ───────────────────
        let title = ""
        let message = ""
        let type = "info"
        let link: string | null = orderLink

        switch (name) {
            case "order.placed":
                title = "Order placed"
                message = `Order ${orderLabel} is in. We'll start the share transfer shortly.`
                type = "success"
                break
            case "order.completed":
                title = "Order completed"
                message = `Order ${orderLabel} has been completed.`
                type = "success"
                break
            case "order.payment_captured":
                title = "Payment confirmed"
                message = `Payment for order ${orderLabel} has been confirmed.`
                type = "success"
                break
            case "order.shares_received_in_ops":
                title = "Shares received"
                message = `Step 2 of 4 — shares for order ${orderLabel} arrived at our operations desk.`
                type = "info"
                break
            case "order.boid_added_as_beneficiary":
                title = "Demat set up"
                message = `Step 3 of 4 — your demat is set up for transfer on order ${orderLabel}.`
                type = "info"
                break
            case "order.shares_transferred":
                title = "Shares delivered"
                message = `Order ${orderLabel} complete — shares credited to your demat. Step 4 of 4 done.`
                type = "success"
                break
            case "order.canceled":
                title = "Order canceled"
                message = data?.reason
                    ? `Order ${orderLabel} canceled — ${data.reason}.`
                    : `Order ${orderLabel} has been canceled.`
                type = "warning"
                break
            case "order.return_requested":
                title = "Return requested"
                message = `A return request was created for order ${orderLabel}.`
                type = "info"
                break
            case "order.return_received":
                title = "Return received"
                message = `Returned shares for order ${orderLabel} have been received.`
                type = "info"
                break
            default:
                // Not an order-shaped event — leave link null so the row
                // is read-only.
                link = null
        }

        if (customerId && title && message) {
            try {
                await polemarchModule.createNotifications({
                    customer_id: customerId,
                    title,
                    message,
                    type,
                    link,
                })
            } catch (err) {
                console.error("[notification-handler] in-app create failed:", err)
            }
        }

        // ── Transactional email ────────────────────────────────────
        if (customerId) {
            await sendEventEmail(container, name, payload)
        }

        // ── Ops heads-up copy for new orders ───────────────────────
        if (name === "order.placed") {
            await sendEventEmail(container, "admin.new_order", {
                customer_id: customerId,
                customer: { email: data?.email || "" },
                order: payload.order,
                total_inr: payload.total_inr,
                admin_order_url: `${process.env.MEDUSA_ADMIN_URL || ""}/app/orders/${orderId}`,
            })
        }
    } catch (err) {
        console.error("[notification-handler] failed:", err)
    }
}

export const config: SubscriberConfig = {
    event: [
        "order.placed",
        "order.completed",
        "order.payment_captured",
        // Share-transfer pipeline steps 2-4 (step 1 is `order.placed`).
        // These are re-emitted by share-transfer-notifier.ts from the
        // raw `share_transfer.advanced` event the admin route fires.
        "order.shares_received_in_ops",
        "order.boid_added_as_beneficiary",
        "order.shares_transferred",
        "order.canceled",
        "order.return_requested",
        "order.return_received",
    ],
}
