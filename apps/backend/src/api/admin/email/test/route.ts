import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import nodemailer from "nodemailer"
import {
    POLEMARCH_EMAIL_MODULE,
    EmailModuleService,
} from "../../../../modules/polemarch_communication"

/**
 * POST /admin/email/test
 *
 * Verifies the live SMTP config by either just verifying the connection
 * (`dry_run: true`, default) or by actually sending a short email to the
 * address in the payload. Records the result into `last_test_ok` /
 * `last_test_error` on the SmtpConfig row so the Settings tab can
 * surface it.
 */
const BodySchema = z.object({
    /** Where to send the probe. Required when `dry_run` is false. */
    to: z.string().email().optional(),
    /** When true (default), only verifies the SMTP handshake — doesn't
     *  actually send any email. */
    dry_run: z.boolean().optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const parsed = BodySchema.safeParse(req.body ?? {})
        if (!parsed.success) {
            return res
                .status(400)
                .json({ message: "Invalid payload", errors: parsed.error.flatten() })
        }
        const dryRun = parsed.data.dry_run !== false

        const mod = req.scope.resolve(POLEMARCH_EMAIL_MODULE) as EmailModuleService
        const cfg = await mod.getSmtpConfigDecrypted()
        if (!cfg) {
            return res.status(400).json({
                ok: false,
                message: "SMTP is not configured. Save host + from_email first.",
            })
        }

        const transporter = nodemailer.createTransport({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            auth:
                cfg.username && cfg.password
                    ? { user: cfg.username, pass: cfg.password }
                    : undefined,
            // 10s cap — this is a user-facing test, don't hang the admin.
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 10_000,
        })

        try {
            await transporter.verify()
        } catch (err: any) {
            await mod.recordTestResult(false, err?.message || "verify failed")
            return res.status(200).json({
                ok: false,
                stage: "verify",
                message: err?.message || "SMTP verify failed",
            })
        }

        if (dryRun) {
            await mod.recordTestResult(true, null)
            return res.json({
                ok: true,
                stage: "verify",
                message: "SMTP connection OK (handshake verified, no email sent).",
            })
        }

        // Live send mode.
        if (!parsed.data.to) {
            return res
                .status(400)
                .json({ ok: false, message: "`to` is required when dry_run=false" })
        }

        const from = cfg.from_name
            ? `"${cfg.from_name}" <${cfg.from_email}>`
            : cfg.from_email

        try {
            const info = await transporter.sendMail({
                from,
                to: parsed.data.to,
                replyTo: cfg.reply_to || undefined,
                subject: "Risitex email test",
                text: "This is a test email from the Risitex admin. If you received this, SMTP is configured correctly.",
                html: `<p>This is a test email from the <strong>Risitex admin</strong>.</p><p>If you received this, SMTP is configured correctly.</p>`,
            })
            await mod.recordTestResult(true, null)
            await mod.logEmail({
                to_email: parsed.data.to,
                template_slug: null,
                subject: "Risitex email test",
                status: "sent",
                provider_message_id: info.messageId ?? null,
                meta: { source: "admin_test" },
            })
            return res.json({
                ok: true,
                stage: "send",
                message_id: info.messageId ?? null,
                message: `Test email sent to ${parsed.data.to}.`,
            })
        } catch (err: any) {
            await mod.recordTestResult(false, err?.message || "send failed")
            await mod.logEmail({
                to_email: parsed.data.to,
                template_slug: null,
                subject: "Risitex email test",
                status: "failed",
                error: err?.message || "send failed",
                meta: { source: "admin_test" },
            })
            return res.status(200).json({
                ok: false,
                stage: "send",
                message: err?.message || "SMTP send failed",
            })
        }
    } catch (err: any) {
        console.error("[admin/email/test] POST failed:", err)
        return res.status(500).json({ ok: false, message: err?.message || "Test failed" })
    }
}
