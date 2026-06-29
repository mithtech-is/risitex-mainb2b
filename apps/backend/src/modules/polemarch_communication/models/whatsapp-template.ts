import { model } from "@medusajs/framework/utils"

/**
 * Meta WhatsApp template registry — server-side source of truth.
 *
 * One row per template. Risitex keeps the canonical structure here
 * (so the same template can be re-pushed if the polyg.in account is
 * reset) and tracks the lifecycle of its corresponding remote template
 * on polyg.in / Meta.
 *
 * Lifecycle states (`polygin_status`):
 *   "draft"     — exists locally, not yet pushed.
 *   "pushed"    — POST /api/user/add_meta_templet returned ok; Meta is
 *                 reviewing.
 *   "approved"  — Meta approved the template; safe to send via
 *                 /api/v1/send_templet.
 *   "rejected"  — Meta rejected. `polygin_last_error` carries the reason.
 *   "paused"    — Meta paused because of low quality / too many user
 *                 blocks. Edit and re-push.
 *
 * Categories: "AUTHENTICATION" | "MARKETING" | "UTILITY". Authentication
 * templates are the only ones Meta lets you use for OTP-style sends; the
 * delivery rate / latency is also dramatically better than UTILITY for
 * the same content. Use AUTHENTICATION whenever the body is solely a
 * one-time code.
 *
 * `components` is the Meta WhatsApp template components array, e.g.
 *   [
 *     { type: "BODY", text: "*{{1}}* is your Risitex OTP." },
 *     { type: "FOOTER", text: "Do not share this code." }
 *   ]
 *
 * `variables` is a parallel descriptor used by our send path — it tells
 * the template-fill helper what each {{N}} maps to and provides sample
 * values for Meta's template-approval review.
 *
 * `name` MUST match Meta's template name rules (lowercase letters,
 * digits, underscores; ≤512 chars). It's the value sent as `templetName`
 * to /api/v1/send_templet at runtime.
 */
export const WhatsappTemplate = model.define(
    "polemarch_whatsapp_template",
    {
        id: model.id().primaryKey(),
        /** Stable internal slug used as the lookup key from
         *  subscribers + service code (e.g. "auth.phone_otp_login"). */
        slug: model.text().searchable().unique(),
        /** Meta template name — what gets sent as `templetName`. */
        name: model.text(),
        /** Human-readable label for the admin UI. */
        label: model.text().nullable(),
        /** Description / when-to-use note for the admin UI. */
        description: model.text().nullable(),
        /** "AUTHENTICATION" | "MARKETING" | "UTILITY" */
        category: model.text(),
        /** BCP-47-ish locale Meta accepts: "en", "en_US", "hi" … */
        language: model.text().default("en"),
        /** "STANDARD" | "CAROUSEL" | "CATALOG" — STANDARD covers all
         *  the cases we care about (text + media + buttons). */
        template_type: model.text().default("STANDARD"),
        /** Meta components array (HEADER / BODY / FOOTER / BUTTONS). */
        components: model.json(),
        /** Variable descriptors:
         *      [{ key: "first_name", sample: "Mira", required: true }, …]
         *  The position in the array is the {{N}} slot; index 0 → {{1}}. */
        variables: model.json().nullable(),
        /** When true, this row was seeded by Risitex and is part of
         *  the system catalog. System rows can still be edited but the
         *  seed loader avoids overwriting their bodies on boot. */
        is_system: model.boolean().default(false),
        /** Lifecycle on polyg.in / Meta. */
        polygin_status: model
            .enum(["draft", "pushed", "approved", "rejected", "paused"])
            .default("draft"),
        /** Polygin's id for the pushed template (returned by add_meta_
         *  templet). Set after a successful push. */
        polygin_template_id: model.text().nullable(),
        polygin_pushed_at: model.dateTime().nullable(),
        polygin_last_synced_at: model.dateTime().nullable(),
        polygin_last_error: model.text().nullable(),
    },
)
