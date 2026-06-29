import { model } from "@medusajs/framework/utils"

/**
 * Append-only log of every outbound email attempt.
 *
 * One row per `send()` call in the notification provider. Succeeds with
 * `status="sent"` + a `provider_message_id` (nodemailer envelope id),
 * or fails with `status="failed"` + an `error` string. `meta` stores the
 * rendered subject and the Handlebars context for post-hoc debugging.
 */
export const EmailLog = model.define("polemarch_email_log", {
    id: model.id().primaryKey(),
    to_email: model.text().index(),
    template_slug: model.text().index().nullable(),
    subject: model.text().nullable(),
    status: model.enum(["sent", "failed", "skipped"]),
    error: model.text().nullable(),
    provider_message_id: model.text().nullable(),
    /** Contextual extras — event name, customer id, rendered subject, etc. */
    meta: model.json().nullable(),
})
