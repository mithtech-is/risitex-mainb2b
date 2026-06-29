import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers"
import { sendEventEmail } from "../modules/polemarch_communication/helpers/send-event-email"

/**
 * Listens to `auth.password_reset` — emitted by Medusa's
 * `generateResetPasswordTokenWorkflow` whenever POST
 * /auth/customer/emailpass/reset-password runs successfully.
 *
 * The event payload is:
 *   { entity_id, actor_type, token, metadata }
 *
 * `entity_id` is the email the user typed into the form; `actor_type`
 * is either "customer" or "user". We only email customers — admin
 * resets go through a separate path.
 */
export default async function passwordResetHandler({
    event,
    container,
}: SubscriberArgs<any>) {
    try {
        const data = (event?.data ?? {}) as {
            entity_id?: string
            actor_type?: string
            token?: string
            metadata?: Record<string, any>
        }

        if (data.actor_type !== "customer") return
        if (!data.entity_id || !data.token) return

        const storefront =
            process.env.STOREFRONT_URL || "http://localhost:3000"
        const reset_url = `${storefront}/auth/reset-password?token=${encodeURIComponent(data.token)}&email=${encodeURIComponent(data.entity_id)}`

        // Always log the link so it's grabbable in dev even when no email
        // provider is wired (mirrors the company-approval login link).
        console.log(
            `[password-reset] RESET LINK for ${data.entity_id} → ${reset_url}`,
        )

        await sendEventEmail(
            container,
            "auth.password_reset",
            {
                entity_id: data.entity_id,
                token: data.token,
                reset_url,
                expires_in: "15 minutes",
                customer: { email: data.entity_id, first_name: "there" },
            },
            // Token flow happens before we look up the customer row,
            // and the recipient is well known — pass it directly.
            { to: data.entity_id, skipCustomerLookup: true },
        )
    } catch (err) {
        console.error("[password-reset] subscriber failed:", err)
    }
}

export const config: SubscriberConfig = {
    event: ["auth.password_reset"],
}
