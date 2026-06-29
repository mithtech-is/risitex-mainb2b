import { model } from "@medusajs/framework/utils"

/**
 * Polygin WhatsApp gateway configuration — singleton (id = "default").
 *
 * Used by the WhatsApp branch of the phone-message router. The Polygin
 * REST endpoint accepts a Bearer token (the same value also goes in the
 * JSON body's `token` field).
 *
 * `token_encrypted` and `dashboard_token_encrypted` are AES-256-GCM
 * ciphertext keyed by `AT_REST_ENCRYPTION_KEY`. `sender_phone` is the
 * WhatsApp sender number in E.164 form that Polygin has provisioned for
 * this account.
 */
export const PolyginConfig = model.define("polemarch_polygin_config", {
    id: model.id().primaryKey(),
    /** AES-256-GCM ciphertext of the REST-API JWT used for sends —
     *  shown on polyg.in's "Rest API" / "Conversational API" / "Template
     *  API" pages. Powers /api/qr/rest/send_message + /api/v1/send_templet.
     *  REQUIRED for any WhatsApp send to work. */
    token_encrypted: model.text().nullable(),
    /** AES-256-GCM ciphertext of the dashboard session JWT (captured
     *  from localStorage.wacrm_user on polyg.in). OPTIONAL — only used
     *  by the template-management endpoints under /api/user/*:
     *    - GET  /api/user/get_my_meta_templets_beta  (status sync)
     *    - POST /api/user/add_meta_templet           (push template)
     *  Polygin's public REST API token does NOT authenticate against
     *  these endpoints, so admins who want automatic status sync /
     *  template push need to capture this JWT separately. Without it,
     *  the manual "Copy for polyg.in" + manual status flip flow still
     *  works fine. */
    dashboard_token_encrypted: model.text().nullable(),
    sender_phone: model.text().nullable(),
    /** Saved destination phone for the "Send test" / "Send template
     *  test" admin actions. E.164 form. Populated once by the operator
     *  via /admin/communication/polygin/config so they don't have to
     *  retype it every time they probe the gateway. Plain text — same
     *  PII risk class as `sender_phone`. */
    test_phone: model.text().nullable(),
    /** Master kill switch — when false, the WhatsApp branch returns
     *  "skipped" so the router falls through to SMS without a wasted
     *  HTTP round-trip. */
    enabled: model.boolean().default(true),
    last_test_at: model.dateTime().nullable(),
    last_test_ok: model.boolean().nullable(),
    last_test_error: model.text().nullable(),
})
