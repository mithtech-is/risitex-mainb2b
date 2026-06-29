import { model } from "@medusajs/framework/utils"

/**
 * Event-to-WhatsApp-template binding.
 *
 * Mirrors `EventTemplateMap` (which targets email templates) but for the
 * WhatsApp channel. Letting email and WhatsApp bindings live in
 * different tables means an event like `kyc.approved` can have:
 *   - an email template (KYC approved — branded HTML)
 *   - AND a WhatsApp template (polemarch_kyc_approved — Meta-approved)
 * fired independently. Either can be disabled or re-pointed without
 * affecting the other.
 *
 * `template_slug` references a row in `polemarch_whatsapp_template`
 * (NOT in the email-template registry). The send pipeline looks it up,
 * verifies it's `polygin_status="approved"`, and dispatches via
 * /api/v1/send_templet.
 *
 * `to_resolver`:
 *   - "customer_phone" — uses `customer.phone` from the event payload
 *   - "static"         — uses the value of `static_to` (e.g. ops alerts)
 */
export const WhatsappEventMap = model.define("polemarch_whatsapp_event_map", {
    id: model.id().primaryKey(),
    event_name: model.text().searchable().unique(),
    /** Slug of the WhatsApp template to send (lookups the row in
     *  polemarch_whatsapp_template by `slug`). */
    template_slug: model.text(),
    to_resolver: model
        .enum(["customer_phone", "static"])
        .default("customer_phone"),
    /** Static recipient (E.164) when `to_resolver = "static"`. */
    static_to: model.text().nullable(),
    /** Master kill switch for THIS event. */
    enabled: model.boolean().default(true),
})
