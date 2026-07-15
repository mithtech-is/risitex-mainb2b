import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { DEFAULT_TEMPLATES } from "../modules/polemarch_communication/seed/default-templates"

/**
 * Re-write system email templates (is_system = true) from the seed catalog.
 *
 * WHY THIS EXISTS: the boot loader seeds with ON CONFLICT (slug) DO NOTHING
 * so admin edits survive restarts. The flip side is that edits to
 * `seed/default-templates.ts` NEVER reach a database that already has the
 * row — the new copy silently stays on disk. This script pushes it.
 *
 *   npx medusa exec ./src/scripts/refresh-email-templates.ts company.approved
 *   npx medusa exec ./src/scripts/refresh-email-templates.ts     # every slug
 *
 * WARNING: overwrites subject / html / sample_data / name / description for
 * the named slugs, discarding any admin edits to them. Name the slugs you
 * mean rather than refreshing everything.
 */
export default async function refreshEmailTemplates({ container, args }: ExecArgs) {
    const logger = container.resolve("logger") as any
    const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
        raw: (sql: string, bindings?: unknown[]) => Promise<any>
    }

    const only = (args ?? []).filter(Boolean)
    const list = only.length
        ? DEFAULT_TEMPLATES.filter((t) => only.includes(t.slug))
        : DEFAULT_TEMPLATES

    if (!list.length) {
        logger.error(
            `[refresh-email-templates] no catalog template matches: ${only.join(", ")}`,
        )
        process.exit(1)
        return
    }

    let updated = 0
    for (const t of list) {
        const res = await pg.raw(
            `UPDATE polemarch_email_template
                SET subject = ?, html = ?, sample_data = ?::jsonb,
                    name = ?, description = ?, updated_at = now()
              WHERE slug = ? AND deleted_at IS NULL AND is_system = true
              RETURNING id`,
            [
                t.subject,
                t.html,
                JSON.stringify(t.sample_data ?? {}),
                t.name,
                t.description ?? null,
                t.slug,
            ],
        )
        const n = Array.isArray(res?.rows) ? res.rows.length : (res?.rowCount ?? 0)
        if (n > 0) {
            updated++
            logger.info(`[refresh-email-templates] updated "${t.slug}"`)
        } else {
            logger.warn(
                `[refresh-email-templates] no system row for "${t.slug}" — skipped`,
            )
        }
    }
    logger.info(
        `[refresh-email-templates] done — ${updated}/${list.length} template(s) updated.`,
    )
}
