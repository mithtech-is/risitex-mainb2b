import { ExecArgs } from "@medusajs/framework/types"
import {
    POLEMARCH_COMMUNICATION_MODULE,
    CommunicationModuleService,
} from "../modules/polemarch_communication"

/**
 * Fire a one-shot WhatsApp TEMPLATE send through Polygin to verify the
 * production OTP path actually delivers.
 *
 * Run from inside the medusa-backend container:
 *   npx medusa exec ./src/scripts/send-whatsapp-test.ts <e164-phone> [<slug>]
 *
 * Defaults: slug = "test.connection_probe" if not provided. Variables
 * are auto-filled with a unix-timestamp ping id + ISO timestamp so the
 * received message is uniquely identifiable.
 *
 * Why a separate script (vs the existing /admin/communication/polygin/test):
 *   - That route uses sendWhatsapp (free-form). Free-form only works
 *     to numbers that have an open 24h conversation window with the
 *     business. Production OTP delivery uses the TEMPLATE path,
 *     which requires the row's polygin_status === 'approved'. To
 *     prove the template path works end-to-end, we need
 *     sendWhatsappTemplate.
 *   - Free-form failing while templates work (or vice versa) is a
 *     real diagnostic distinction.
 *
 * Exits 0 on a successful provider ack (HTTP 2xx from polyg.in).
 * Note: a successful ack only proves polyg.in accepted the request —
 * actual delivery to WhatsApp is async; check the recipient phone.
 */
export default async function sendWhatsappTest({
    container,
    args,
}: ExecArgs) {
    const to = args?.[0] as string | undefined
    const slug = (args?.[1] as string | undefined) ?? "test.connection_probe"
    const logger = container.resolve("logger") as any

    if (!to || !/^\+[1-9]\d{6,18}$/.test(to)) {
        logger.error(
            "[send-whatsapp-test] usage: npx medusa exec ./src/scripts/send-whatsapp-test.ts <e164> [<slug>]\n" +
                "  e164 must look like +91XXXXXXXXXX",
        )
        process.exit(1)
        return
    }

    const mod = container.resolve(
        POLEMARCH_COMMUNICATION_MODULE,
    ) as CommunicationModuleService

    const tpl = await mod.getWhatsappTemplateBySlug(slug)
    if (!tpl) {
        logger.error(`[send-whatsapp-test] no local template with slug="${slug}"`)
        process.exit(2)
        return
    }
    if (tpl.polygin_status !== "approved") {
        logger.error(
            `[send-whatsapp-test] template "${slug}" is polygin_status=${tpl.polygin_status} — ` +
                `must be 'approved' to send via the template path. ` +
                `Run sync-whatsapp-templates.ts first or push it via push-whatsapp-template.ts.`,
        )
        process.exit(3)
        return
    }

    const variables = [
        String(Math.floor(Date.now() / 1000)),
        new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
    ]

    logger.info(
        `[send-whatsapp-test] sending slug="${slug}" to ${to} with vars=${JSON.stringify(variables)}…`,
    )

    const result = await mod.sendWhatsappTemplate({
        to,
        slug,
        variables,
    })

    if (!result.ok) {
        const reason = "reason" in result ? result.reason : "unknown"
        logger.error(`[send-whatsapp-test] send failed: ${reason}`)
        process.exit(4)
        return
    }

    logger.info(
        `[send-whatsapp-test] send OK. provider message_id=${result.message_id ?? "(none)"}`,
    )
    logger.info(
        "[send-whatsapp-test] check the recipient phone — actual delivery is async on Meta's side.",
    )
}
