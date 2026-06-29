import { ExecArgs } from "@medusajs/framework/types"
import {
    POLEMARCH_COMMUNICATION_MODULE,
    CommunicationModuleService,
} from "../modules/polemarch_communication"

/**
 * Refresh local `polygin_status` + `polygin_template_id` for every
 * WhatsApp template by reading polyg.in's template list and
 * reconciling with Meta's review state.
 *
 * Counterpart to `push-whatsapp-template.ts`: push sends a template UP
 * to Meta for review; this script pulls the latest review state DOWN
 * so a template that flipped from `pushed → approved` on Meta's side
 * gets reflected locally without an admin clicking sync in the UI.
 *
 * Run from inside the medusa-backend container:
 *   npx medusa exec ./src/scripts/sync-whatsapp-templates.ts
 *
 * Requires the polyg.in dashboard JWT in PolyginConfig (token alone
 * doesn't authenticate against `/api/user/get_meta_templet_list`).
 *
 * Exits non-zero on any failure so this can be cron'd safely.
 */
export default async function syncWhatsappTemplates({
    container,
}: ExecArgs) {
    const logger = container.resolve("logger") as any
    const mod = container.resolve(
        POLEMARCH_COMMUNICATION_MODULE,
    ) as CommunicationModuleService

    logger.info("[sync-whatsapp-templates] pulling status from polyg.in…")

    const result = await mod.syncWhatsappTemplatesFromPolygin()
    if (!result.ok) {
        logger.error(
            `[sync-whatsapp-templates] sync failed: ${result.reason ?? "unknown"}`,
        )
        process.exit(2)
        return
    }

    logger.info(
        `[sync-whatsapp-templates] sync OK. ${result.updated} template(s) had their polygin_status / polygin_template_id refreshed.`,
    )
}
