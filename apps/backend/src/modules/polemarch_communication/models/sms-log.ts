import { model } from "@medusajs/framework/utils"

/**
 * Append-only log of every outbound SMS attempt (MSG91 only for now).
 *
 * One row per `sendSms()` call. Status mirrors `EmailLog`:
 *   - "sent"    → provider accepted, returned a message id.
 *   - "failed"  → provider rejected (auth, rate limit, malformed body).
 *   - "skipped" → no MSG91 config, master switch off, or upstream
 *                 caller decided not to send (e.g. dry-run admin test).
 *
 * `meta` stores the request id from MSG91 + DLT template id + any
 * provider-specific telemetry. Body is stored verbatim — for OTP sends
 * the body is the *rendered* SMS text, which contains the plaintext OTP;
 * the column should be treated as sensitive and never exposed to
 * non-admin viewers.
 */
export const SmsLog = model.define("polemarch_sms_log", {
    id: model.id().primaryKey(),
    to_phone: model.text().index(),
    body: model.text().nullable(),
    provider: model.text().default("msg91"),
    status: model.enum(["sent", "failed", "skipped"]),
    error: model.text().nullable(),
    provider_message_id: model.text().nullable(),
    /** Optional foreign key into OtpRequest — set only for OTP sends. */
    otp_request_id: model.text().index().nullable(),
    meta: model.json().nullable(),
})
