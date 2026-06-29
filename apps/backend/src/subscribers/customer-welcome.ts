import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers"
import { sendEventEmail } from "../modules/polemarch_communication/helpers/send-event-email"

/**
 * Welcome email on customer creation.
 *
 * Medusa emits `customer.created` with the customer id in the payload.
 * We look the row up so the template has access to first_name + email,
 * then fire the branded welcome.
 */
export default async function customerWelcomeHandler({
    event,
    container,
}: SubscriberArgs<any>) {
    try {
        const customerId = event?.data?.id
        if (!customerId) return

        const storefront = process.env.STOREFRONT_URL || "https://risitex.com"
        await sendEventEmail(container, "customer.created", {
            customer_id: customerId,
            explore_url: `${storefront}/invest`,
        })
    } catch (err) {
        console.error("[customer-welcome] subscriber failed:", err)
    }
}

export const config: SubscriberConfig = {
    event: ["customer.created"],
}
