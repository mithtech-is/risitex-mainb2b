import { model } from "@medusajs/framework/utils"

/**
 * Editable email template. Body is raw HTML with Handlebars `{{var}}`
 * placeholders — the provider compiles both subject and html on send.
 *
 * `slug` is the stable machine identifier that subscribers pass as
 * the `template` field when calling `notificationModuleService.createNotifications`.
 * `is_system = true` means the row was seeded; the admin UI disables
 * slug editing and DELETE for those rows so the event→template wiring
 * can't be silently broken.
 *
 * `sample_data` is a JSON blob of example variable values used by the
 * in-admin preview (not used when the provider renders a real send).
 */
export const EmailTemplate = model.define("polemarch_email_template", {
    id: model.id().primaryKey(),
    slug: model.text().unique(),
    name: model.text(),
    subject: model.text(),
    html: model.text(),
    is_system: model.boolean().default(false),
    /** JSON object of sample variables for the preview pane. */
    sample_data: model.json().nullable(),
    /** Free-form description shown in the admin list view. */
    description: model.text().nullable(),
})
