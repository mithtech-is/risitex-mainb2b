import { model } from "@medusajs/framework/utils"

/**
 * MSG91 SMS template registry — body source of truth.
 *
 * MSG91 sends through DLT-approved templates (TRAI requirement in
 * India): each template body is registered with TRAI + receives a
 * `dlt_template_id`. We can't programmatically register new DLTs
 * (TRAI's portal is partner-only), so this table just stores:
 *   - the canonical body Risitex wants to send,
 *   - the placeholders ({{1}}…{{var_n}}) and what they mean,
 *   - the `dlt_template_id` the admin pastes back after registering on
 *     MSG91 + getting TRAI approval.
 *
 * On send, we look up the row by slug, fill in the placeholders, and
 * POST to the MSG91 Flow API with that template_id.
 *
 * `is_otp` flags rows that should use the dedicated OTP DLT category
 * (faster latency, higher trust score) — the OTP send path also
 * cross-checks the row's `dlt_template_id` against the row's
 * `dlt_template_id_status === "approved"` before using it; falls back
 * to the Msg91Config's default otp_template_id if the row's id isn't
 * registered yet.
 */
export const SmsTemplate = model.define("polemarch_sms_template", {
    id: model.id().primaryKey(),
    slug: model.text().searchable().unique(),
    label: model.text().nullable(),
    description: model.text().nullable(),
    /** Body with {{1}} {{2}} … placeholders. Sent to MSG91 as the var1 /
     *  var2 / … flow parameter. The body MUST match the DLT-registered
     *  template character-for-character or MSG91 will silently drop. */
    body: model.text(),
    /** Variable descriptors mirroring WhatsappTemplate.variables. */
    variables: model.json().nullable(),
    /** DLT-approved template id from MSG91 dashboard (after TRAI approval). */
    dlt_template_id: model.text().nullable(),
    /** Lifecycle: "draft" before submitting to TRAI, "pending" while in
     *  review, "approved" once usable, "rejected" with a reason in
     *  `dlt_last_error`. */
    dlt_status: model
        .enum(["draft", "pending", "approved", "rejected"])
        .default("draft"),
    dlt_last_error: model.text().nullable(),
    /** Use the OTP-specific DLT type (different DLT category, lower
     *  latency, no commercial-message scrub). The send path will only
     *  pick this row for OTP sends if true. */
    is_otp: model.boolean().default(false),
    /** When true, seed-loader installed this. */
    is_system: model.boolean().default(false),
})
