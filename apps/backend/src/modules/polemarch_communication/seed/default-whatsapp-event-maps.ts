/**
 * Default WhatsApp event-bindings — installed by the seed loader on
 * boot. Each row maps a RISITEX domain event to the slug of a
 * WhatsApp template defined in `default-whatsapp-templates.ts`.
 *
 * Same disable-or-redirect pattern as the email event map: the seed
 * loader uses INSERT ... ON CONFLICT DO NOTHING so admin edits stick
 * across restarts.
 */

export type DefaultWhatsappEventMap = {
    event_name: string
    template_slug: string
    to_resolver: "customer_phone" | "static"
    static_to?: string | null
    enabled?: boolean
}

export const DEFAULT_WHATSAPP_EVENT_MAPS: DefaultWhatsappEventMap[] = [
    // Authentication — these are NOT mapped via events because the OTP
    // send path calls `sendWhatsappTemplate` directly with the slug.
    // They live in the catalog but bypass the event-binding indirection.

    // Account lifecycle
    {
        event_name: "customer.registered",
        template_slug: "account.welcome",
        to_resolver: "customer_phone",
    },
    // Password change — tamper-evident security notice via WA + SMS
    // fallback. Per the May-2026 spec: password changes are one of the
    // explicit "via Polygin & SMS" categories.
    {
        event_name: "auth.password_changed",
        template_slug: "auth.password_changed",
        to_resolver: "customer_phone",
    },
    {
        event_name: "auth.password_reset",
        template_slug: "account.password_reset",
        to_resolver: "customer_phone",
    },

    // Order lifecycle
    {
        event_name: "order.placed",
        template_slug: "order.placed",
        to_resolver: "customer_phone",
    },
    {
        event_name: "order.payment_captured",
        template_slug: "order.payment_captured",
        to_resolver: "customer_phone",
    },
    {
        event_name: "order.canceled",
        template_slug: "order.canceled",
        to_resolver: "customer_phone",
    },
    {
        event_name: "order.shipped",
        template_slug: "order.shipped",
        to_resolver: "customer_phone",
    },
    {
        event_name: "order.delivered",
        template_slug: "order.delivered",
        to_resolver: "customer_phone",
    },

    // Wallet.
    {
        event_name: "wallet.credited",
        template_slug: "wallet.credited",
        to_resolver: "customer_phone",
    },
    {
        event_name: "wallet.debited",
        template_slug: "wallet.debited",
        to_resolver: "customer_phone",
    },

    // Wholesale / B2B onboarding outcomes.
    {
        event_name: "company.approved",
        template_slug: "company.approved",
        to_resolver: "customer_phone",
    },
    {
        event_name: "company.rejected",
        template_slug: "company.rejected",
        to_resolver: "customer_phone",
    },

    // Manual-UPI payment verification. Fired directly (not via the
    // Medusa event bus) by sendEventNotification calls in the
    // store/purchase-orders + admin/payment-verifications routes — the
    // rows here just provide the template lookup, recipient resolver,
    // and an admin toggle.
    {
        event_name: "payment.upi_submitted",
        template_slug: "payment.upi_submitted",
        to_resolver: "customer_phone",
    },
    {
        event_name: "payment.verified",
        template_slug: "payment.verified",
        to_resolver: "customer_phone",
    },
    {
        event_name: "payment.rejected",
        template_slug: "payment.rejected",
        to_resolver: "customer_phone",
    },
    {
        event_name: "payment.clarification",
        template_slug: "payment.clarification",
        to_resolver: "customer_phone",
    },
    // Static ops recipient. Swap static_to for a dedicated ops number if
    // +918660381681 turns out to be the Polygin WhatsApp sender itself.
    {
        event_name: "admin.payment_pending",
        template_slug: "admin.payment_pending",
        to_resolver: "static",
        static_to: "+918660381681",
    },
]
