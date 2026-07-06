import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { LoaderOptions } from "@medusajs/framework/types"
import { DEFAULT_TEMPLATES } from "../seed/default-templates"
import { DEFAULT_EVENT_MAPS } from "../seed/default-event-maps"
import { DEFAULT_WHATSAPP_TEMPLATES } from "../seed/default-whatsapp-templates"
import { DEFAULT_SMS_TEMPLATES } from "../seed/default-sms-templates"
import { DEFAULT_WHATSAPP_EVENT_MAPS } from "../seed/default-whatsapp-event-maps"

/**
 * Idempotent seeding of system email templates + default event
 * bindings. Runs on every module boot.
 *
 * Safety properties:
 *   1. Templates with `is_system = true` are installed with
 *      ON CONFLICT (slug) DO NOTHING — admin edits to a system
 *      template's subject/html/sample_data persist across restarts.
 *   2. Event bindings are installed the same way; disabling or
 *      re-pointing an event in the admin UI sticks across restarts.
 *   3. We never DELETE or UPDATE anything here. Removing a template
 *      from the default list simply means future fresh installs won't
 *      ship it — existing installs keep the row.
 */
export default async function seedDefaults({
    container,
}: LoaderOptions): Promise<void> {
    let pg: any = null
    try {
        pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    } catch {
        // Medusa hasn't wired PG yet — nothing to do. The loader runs
        // again on the next boot.
        return
    }
    if (!pg || typeof pg.raw !== "function") return

    let templatesInserted = 0
    for (const t of DEFAULT_TEMPLATES) {
        try {
            const id = `emt_${t.slug.replace(/[^a-z0-9]/g, "_").slice(0, 40)}`
            const result = await pg.raw(
                `INSERT INTO polemarch_email_template
                   (id, slug, name, subject, html, is_system, sample_data, description, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, true, ?::jsonb, ?, now(), now())
                 ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING
                 RETURNING id`,
                [
                    id,
                    t.slug,
                    t.name,
                    t.subject,
                    t.html,
                    JSON.stringify(t.sample_data ?? {}),
                    t.description ?? null,
                ],
            )
            const rowCount = Array.isArray(result?.rows)
                ? result.rows.length
                : result?.rowCount ?? 0
            if (rowCount > 0) templatesInserted++
        } catch (err: any) {
            console.warn(
                `[polemarch_email] seed: template "${t.slug}" failed: ${err?.message}`,
            )
        }
    }

    let mapsInserted = 0
    for (const m of DEFAULT_EVENT_MAPS) {
        try {
            const id = `etm_${m.event_name.replace(/[^a-z0-9]/g, "_").slice(0, 40)}`
            const result = await pg.raw(
                `INSERT INTO polemarch_event_template_map
                   (id, event_name, template_slug, to_resolver, static_to, enabled, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, now(), now())
                 ON CONFLICT (event_name) WHERE deleted_at IS NULL DO NOTHING
                 RETURNING id`,
                [
                    id,
                    m.event_name,
                    m.template_slug,
                    m.to_resolver,
                    m.static_to ?? null,
                    m.enabled !== false,
                ],
            )
            const rowCount = Array.isArray(result?.rows)
                ? result.rows.length
                : result?.rowCount ?? 0
            if (rowCount > 0) mapsInserted++
        } catch (err: any) {
            console.warn(
                `[polemarch_email] seed: mapping "${m.event_name}" failed: ${err?.message}`,
            )
        }
    }

    // ─── WhatsApp template catalog ─────────────────────────────────
    let waTemplatesInserted = 0
    for (const t of DEFAULT_WHATSAPP_TEMPLATES) {
        try {
            const id = `wat_${t.slug.replace(/[^a-z0-9]/g, "_").slice(0, 40)}`
            const result = await pg.raw(
                `INSERT INTO polemarch_whatsapp_template
                   (id, slug, name, label, description, category, language,
                    template_type, components, variables, is_system,
                    polygin_status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'STANDARD', ?::jsonb, ?::jsonb, true,
                         'draft', now(), now())
                 ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING
                 RETURNING id`,
                [
                    id,
                    t.slug,
                    t.name,
                    t.label,
                    t.description,
                    t.category,
                    t.language,
                    JSON.stringify(t.components ?? []),
                    JSON.stringify(t.variables ?? []),
                ],
            )
            const rowCount = Array.isArray(result?.rows)
                ? result.rows.length
                : result?.rowCount ?? 0
            if (rowCount > 0) waTemplatesInserted++
        } catch (err: any) {
            console.warn(
                `[polemarch_communication] seed: whatsapp template "${t.slug}" failed: ${err?.message}`,
            )
        }
    }

    // ─── SMS template catalog ──────────────────────────────────────
    let smsTemplatesInserted = 0
    for (const t of DEFAULT_SMS_TEMPLATES) {
        try {
            const id = `smt_${t.slug.replace(/[^a-z0-9]/g, "_").slice(0, 40)}`
            const result = await pg.raw(
                `INSERT INTO polemarch_sms_template
                   (id, slug, label, description, body, variables,
                    dlt_template_id, dlt_status, is_otp, is_system,
                    created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?::jsonb, NULL, 'draft', ?, true,
                         now(), now())
                 ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING
                 RETURNING id`,
                [
                    id,
                    t.slug,
                    t.label,
                    t.description,
                    t.body,
                    JSON.stringify(t.variables ?? []),
                    t.is_otp === true,
                ],
            )
            const rowCount = Array.isArray(result?.rows)
                ? result.rows.length
                : result?.rowCount ?? 0
            if (rowCount > 0) smsTemplatesInserted++
        } catch (err: any) {
            console.warn(
                `[polemarch_communication] seed: sms template "${t.slug}" failed: ${err?.message}`,
            )
        }
    }

    // ─── WhatsApp event mappings ───────────────────────────────────
    let waMapsInserted = 0
    for (const m of DEFAULT_WHATSAPP_EVENT_MAPS) {
        try {
            const id = `wem_${m.event_name.replace(/[^a-z0-9]/g, "_").slice(0, 40)}`
            const result = await pg.raw(
                `INSERT INTO polemarch_whatsapp_event_map
                   (id, event_name, template_slug, to_resolver, static_to, enabled,
                    created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, now(), now())
                 ON CONFLICT (event_name) WHERE deleted_at IS NULL DO NOTHING
                 RETURNING id`,
                [
                    id,
                    m.event_name,
                    m.template_slug,
                    m.to_resolver,
                    m.static_to ?? null,
                    m.enabled !== false,
                ],
            )
            const rowCount = Array.isArray(result?.rows)
                ? result.rows.length
                : result?.rowCount ?? 0
            if (rowCount > 0) waMapsInserted++
        } catch (err: any) {
            console.warn(
                `[polemarch_communication] seed: whatsapp mapping "${m.event_name}" failed: ${err?.message}`,
            )
        }
    }

    // ─── Brand config singleton ────────────────────────────────────
    let brandRowInserted = 0
    try {
        const result = await pg.raw(
            `INSERT INTO polemarch_brand_config
               (id, brand_name, company_name, storefront_url, support_email, support_phone, address, created_at, updated_at)
             VALUES ('default', 'RISITEX', 'RISITEX', 'https://risitex.com', 'risitexindia@gmail.com', '+91 8660381681', '#48-34-10, 4th Floor, 1st Cross, Lalbagh Road, Bangalore 560027', now(), now())
             ON CONFLICT (id) WHERE deleted_at IS NULL DO NOTHING
             RETURNING id`,
        )
        const rowCount = Array.isArray(result?.rows)
            ? result.rows.length
            : result?.rowCount ?? 0
        brandRowInserted = rowCount > 0 ? 1 : 0
    } catch (err: any) {
        console.warn(
            `[polemarch_communication] seed: brand_config failed: ${err?.message}`,
        )
    }

    if (
        templatesInserted ||
        mapsInserted ||
        waTemplatesInserted ||
        smsTemplatesInserted ||
        waMapsInserted ||
        brandRowInserted
    ) {
        console.log(
            `[polemarch_communication] seeded ${templatesInserted} email template(s), ${mapsInserted} email event mapping(s), ${waTemplatesInserted} WhatsApp template(s), ${smsTemplatesInserted} SMS template(s), ${waMapsInserted} WhatsApp event mapping(s), ${brandRowInserted} brand config`,
        )
    }
}
