import { model } from "@medusajs/framework/utils"

/**
 * MSG91 SMS gateway configuration — singleton (id = "default").
 *
 * Used by the SMS branch of the phone-message router. Same secret-at-rest
 * pattern as `SmtpConfig`: `auth_key_encrypted` is AES-256-GCM ciphertext
 * keyed by `AT_REST_ENCRYPTION_KEY`. Admin GET responses redact the key
 * — the plaintext only lives inside the `sendSms` call.
 *
 * `sender_id`         — 6-character DLT-approved header (e.g. "POLMRC").
 * `sms_template_id`   — DLT-approved transactional template id used for
 *                       general-purpose SMS sends. Body interpolates as
 *                       `var1`.
 * `otp_template_id`   — DLT-approved OTP transactional template id used
 *                       specifically for the phone-OTP fallback. Body
 *                       interpolates the OTP as `var1`. Kept separate
 *                       from `sms_template_id` because the OTP template
 *                       has a fixed 1-variable shape; mixing them risks
 *                       sending OTPs through a marketing template.
 */
// IMPORTANT: the DML entity name MUST be digit-free.
//
// Medusa's `toCamelCase` (in @medusajs/utils/dist/common/to-camel-case.js)
// has a regex that accepts already-camelCased input as a fast path, but
// the regex doesn't allow digits. When the regex fails on a string like
// "polemarch_msg91_config", it lowercases the whole string instead of
// preserving casing. The Awilix container then registers
// "polemarchmsg91configService" while the MedusaService factory tries to
// resolve "polemarchMsg91ConfigService" — mismatch → "Could not resolve"
// at runtime on every CRUD call.
//
// Other models (smtp_config, polygin_config, sms_log, etc.) avoid this
// because their names are digit-free and pass the camelCase regex.
//
// The fix: pass `{ name, tableName }` so the entity's logical name is
// digit-free ("polemarch_msg_provider_config") while the actual DB
// table keeps the original "polemarch_msg91_config" identifier — no
// migration needed.
export const Msg91Config = model.define(
    {
        name: "polemarch_msg_provider_config",
        tableName: "polemarch_msg91_config",
    },
    {
    id: model.id().primaryKey(),
    /** AES-256-GCM ciphertext. Never decrypt outside CommunicationModuleService. */
    auth_key_encrypted: model.text().nullable(),
    sender_id: model.text().nullable(),
    sms_template_id: model.text().nullable(),
    otp_template_id: model.text().nullable(),
    /** Master kill switch — when false, the SMS branch returns
     *  "skipped" instead of sending. */
    enabled: model.boolean().default(true),
    last_test_at: model.dateTime().nullable(),
    last_test_ok: model.boolean().nullable(),
    last_test_error: model.text().nullable(),
})
