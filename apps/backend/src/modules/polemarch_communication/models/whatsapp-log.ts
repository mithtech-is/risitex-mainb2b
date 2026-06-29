import { model } from "@medusajs/framework/utils"

/**
 * Append-only log of every outbound WhatsApp attempt (Polygin only for now).
 *
 * One row per `sendWhatsapp()` call. Status mirrors `SmsLog`:
 *   - "sent"    → provider accepted, returned a message id.
 *   - "failed"  → HTTP 4xx/5xx, success:false in the body, or the
 *                 sender phone isn't WhatsApp-enabled.
 *   - "skipped" → no Polygin config, master switch off, or dry-run.
 *
 * Treat `body` as sensitive — for OTP messages it contains the plaintext
 * OTP. The column is admin-only.
 */
export const WhatsappLog = model.define("polemarch_whatsapp_log", {
    id: model.id().primaryKey(),
    to_phone: model.text().index(),
    body: model.text().nullable(),
    provider: model.text().default("polygin"),
    status: model.enum(["sent", "failed", "skipped"]),
    error: model.text().nullable(),
    provider_message_id: model.text().nullable(),
    /** Optional foreign key into OtpRequest — set only for OTP sends. */
    otp_request_id: model.text().index().nullable(),
    meta: model.json().nullable(),
})
