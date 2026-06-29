/**
 * Default event → template bindings. Installed by the loader on boot
 * with `ON CONFLICT (event_name) DO NOTHING`, so ops can disable /
 * re-point anything in the admin Events tab without the loader
 * clobbering their change on the next restart.
 */

export type SeedEventMap = {
    event_name: string
    template_slug: string
    to_resolver: "customer_email" | "admin_email" | "static"
    static_to?: string | null
    enabled?: boolean
}

export const DEFAULT_EVENT_MAPS: SeedEventMap[] = [
    // Order lifecycle (fired by the Medusa subscriber).
    { event_name: "order.placed", template_slug: "order.placed", to_resolver: "customer_email" },
    { event_name: "order.payment_captured", template_slug: "order.payment_captured", to_resolver: "customer_email" },
    { event_name: "order.canceled", template_slug: "order.canceled", to_resolver: "customer_email" },
    { event_name: "order.shipped", template_slug: "order.shipped", to_resolver: "customer_email" },
    { event_name: "order.delivered", template_slug: "order.delivered", to_resolver: "customer_email" },
    { event_name: "order.return_requested", template_slug: "order.return_received", to_resolver: "customer_email" },
    { event_name: "order.return_received", template_slug: "order.return_received", to_resolver: "customer_email" },

    // Account lifecycle.
    { event_name: "customer.created", template_slug: "customer.welcome", to_resolver: "customer_email" },
    { event_name: "auth.password_reset", template_slug: "auth.password_reset", to_resolver: "customer_email" },
    { event_name: "auth.password_reset_otp", template_slug: "auth.password_reset_otp", to_resolver: "customer_email" },
    { event_name: "auth.password_changed", template_slug: "auth.password_changed", to_resolver: "customer_email" },
    { event_name: "auth.email_otp", template_slug: "auth.email_otp", to_resolver: "customer_email" },
    // Email-verified confirmation.
    { event_name: "account.email_verified", template_slug: "account.email_verified", to_resolver: "customer_email" },

    // Wallet.
    { event_name: "wallet.credited", template_slug: "wallet.credited", to_resolver: "customer_email" },
    { event_name: "wallet.debited", template_slug: "wallet.debited", to_resolver: "customer_email" },
    { event_name: "wallet.frozen", template_slug: "wallet.frozen", to_resolver: "customer_email" },

    // Cart recovery. Fired by the `cart-abandoned-emails` cron in
    // four tiers: 1h / 1d / 7d / 30d. Idempotent via per-cart
    // metadata flags so the same cart never sees duplicates within
    // a tier. `cart.abandoned_48h` is kept as a legacy alias,
    // disabled by default so pre-migration rows don't orphan.
    { event_name: "cart.abandoned_1h",  template_slug: "cart.abandoned_1h",  to_resolver: "customer_email" },
    { event_name: "cart.abandoned_1d",  template_slug: "cart.abandoned_1d",  to_resolver: "customer_email" },
    { event_name: "cart.abandoned_7d",  template_slug: "cart.abandoned_7d",  to_resolver: "customer_email" },
    { event_name: "cart.abandoned_30d", template_slug: "cart.abandoned_30d", to_resolver: "customer_email" },
    { event_name: "cart.abandoned_48h", template_slug: "cart.abandoned_48h", to_resolver: "customer_email", enabled: false },

    // Wholesale / B2B onboarding.
    { event_name: "company.application_received", template_slug: "company.application_received", to_resolver: "customer_email" },
    { event_name: "company.approved", template_slug: "company.approved", to_resolver: "customer_email" },
    { event_name: "company.rejected", template_slug: "company.rejected", to_resolver: "customer_email" },

    // Admin copies. All resolve via `admin_email` which reads
    // ADMIN_NOTIFICATION_EMAIL at send time.
    { event_name: "admin.new_order", template_slug: "admin.new_order", to_resolver: "admin_email" },
    { event_name: "admin.new_company_application", template_slug: "admin.new_company_application", to_resolver: "admin_email" },
    { event_name: "admin.new_contact_submission", template_slug: "admin.new_contact_submission", to_resolver: "admin_email" },
]
