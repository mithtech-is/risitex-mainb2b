import { ExecArgs } from "@medusajs/framework/types"
import {
    POLEMARCH_COMMUNICATION_MODULE,
    CommunicationModuleService,
} from "../modules/polemarch_communication"

/**
 * Push a single WhatsApp template (by slug) from our local catalog up
 * to polyg.in's `/api/user/add_meta_templet`. polyg.in forwards it to
 * Meta for review.
 *
 * Run from inside the medusa-backend container:
 *   npx medusa exec ./src/scripts/push-whatsapp-template.ts test.connection_probe
 *
 * Default slug is `test.connection_probe` (the connection-probe
 * template seeded for diagnostic purposes). Override by passing any
 * registered slug as the first arg.
 *
 * Requires:
 *   - polemarch_polygin_config row populated (token + dashboard_token).
 *     Token alone isn't enough — `/api/user/*` paths need the dashboard
 *     JWT. Set both via /admin/communication/polygin/config.
 *
 * Output:
 *   - Logs the resulting polygin_status (`pushed` on success, `draft`
 *     if the request bailed before hitting polyg.in).
 *   - Prints the provider response so any "name already exists" /
 *     "category not allowed" feedback from polyg.in is visible.
 *   - Exits non-zero on any failure so this can be wrapped by ops
 *     scripts.
 *
 * After this completes, watch for the `polygin_status` flip to
 * `approved` in /admin/communication/whatsapp-templates (refreshed by
 * the existing /admin/communication/whatsapp-templates/sync endpoint).
 * Approval is asynchronous on Meta's side (typically minutes; can
 * take longer for AUTHENTICATION category).
 */
export default async function pushWhatsappTemplate({
    container,
    args,
}: ExecArgs) {
    const slug = (args?.[0] as string | undefined) ?? "test.connection_probe"
    const logger = container.resolve("logger") as any
    const mod = container.resolve(
        POLEMARCH_COMMUNICATION_MODULE,
    ) as CommunicationModuleService

    logger.info(`[push-whatsapp-template] pushing slug="${slug}" → polyg.in…`)

    const existing = await mod.getWhatsappTemplateBySlug(slug)
    if (!existing) {
        logger.error(
            `[push-whatsapp-template] no local template registered with slug="${slug}". ` +
                `Available: list /admin/communication/whatsapp-templates or check ` +
                `src/modules/polemarch_communication/seed/default-whatsapp-templates.ts`,
        )
        process.exit(1)
        return
    }
    logger.info(
        `[push-whatsapp-template] found local row id=${existing.id} ` +
            `(polygin_status=${existing.polygin_status}, has_template_id=${Boolean(
                existing.polygin_template_id,
            )})`,
    )

    const result = await mod.pushWhatsappTemplateToPolygin({ slug })
    if (!result.ok) {
        const reason = "reason" in result ? result.reason : "unknown"
        logger.error(`[push-whatsapp-template] push failed: ${reason}`)
        if ("provider_response" in result && result.provider_response) {
            logger.error(
                "[push-whatsapp-template] provider response: " +
                    JSON.stringify(result.provider_response).slice(0, 500),
            )
        }
        process.exit(2)
        return
    }

    logger.info(
        `[push-whatsapp-template] push OK. New polygin_status=${result.row?.polygin_status}, ` +
            `polygin_template_id=${result.row?.polygin_template_id ?? "(pending)"}.`,
    )
    if (result.provider_response) {
        logger.info(
            "[push-whatsapp-template] provider response: " +
                JSON.stringify(result.provider_response).slice(0, 500),
        )
    }
    logger.info(
        "[push-whatsapp-template] done. Approval is asynchronous on Meta's " +
            "side — re-run /admin/communication/whatsapp-templates/sync in ~5–30 min " +
            "to refresh polygin_status from polyg.in.",
    )
}
