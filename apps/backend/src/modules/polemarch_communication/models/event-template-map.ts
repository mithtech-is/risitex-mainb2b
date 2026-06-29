import { model } from "@medusajs/framework/utils"

/**
 * Event → template binding.
 *
 * Subscribers listening to Medusa + custom events look up the row for
 * their event name, resolve the recipient per `to_resolver`, and call
 * `notificationModuleService.createNotifications` with the bound slug.
 *
 *   to_resolver:
 *     customer_email — event payload must carry `customer_id`; subscriber
 *                      fetches the customer and uses their email.
 *     admin_email    — sends to every admin user.
 *     static         — uses `static_to` verbatim (ops inbox, compliance
 *                      relay, etc.).
 */
export const EventTemplateMap = model.define("polemarch_event_template_map", {
    id: model.id().primaryKey(),
    event_name: model.text().unique().index(),
    template_slug: model.text(),
    to_resolver: model.enum(["customer_email", "admin_email", "static"]).default("customer_email"),
    static_to: model.text().nullable(),
    enabled: model.boolean().default(true),
})
