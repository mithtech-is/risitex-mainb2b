import { model } from "@medusajs/framework/utils"

/**
 * Outgoing SMTP configuration — singleton.
 *
 * Fluent-SMTP-style: we maintain a single active SMTP connection that
 * the notification provider uses for every outbound email. `id` is
 * fixed to `"default"` so all writes are an upsert on that key.
 *
 * `password_encrypted` is AES-256-GCM ciphertext keyed by
 * `AT_REST_ENCRYPTION_KEY` (shared env var for at-rest secrets —
 * the legacy name `WALLET_ENCRYPTION_KEY` is still accepted for
 * back-compat). Admin API GET returns the password field redacted
 * — the plaintext only ever lives inside the provider's sendMail call.
 */
export const SmtpConfig = model.define("polemarch_smtp_config", {
    id: model.id().primaryKey(),
    host: model.text(),
    port: model.number().default(587),
    /** true for implicit TLS (port 465). false uses STARTTLS upgrade. */
    secure: model.boolean().default(false),
    username: model.text().nullable(),
    /** AES-256-GCM ciphertext. Never decrypt outside EmailModuleService. */
    password_encrypted: model.text().nullable(),
    from_name: model.text().nullable(),
    from_email: model.text(),
    reply_to: model.text().nullable(),
    /** Master kill switch — when false the provider returns a "disabled"
     *  result instead of sending. Useful for staging/dry-run. */
    enabled: model.boolean().default(true),
    /** Result of the last successful "Test connection" call, for UI hinting. */
    last_test_at: model.dateTime().nullable(),
    last_test_ok: model.boolean().nullable(),
    last_test_error: model.text().nullable(),
})
