import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import type {
    ProviderSendNotificationDTO,
    ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import nodemailer, { type Transporter } from "nodemailer"
import Handlebars from "handlebars"
import type { EmailModuleService } from "../polemarch_communication"
import { POLEMARCH_EMAIL_MODULE } from "../polemarch_communication"

type InjectedDependencies = {
    logger: Logger
    [POLEMARCH_EMAIL_MODULE]: EmailModuleService
}

type Options = {
    channels?: string[]
}

/**
 * Risitex SMTP notification provider.
 *
 * Registered under Modules.NOTIFICATION on the "email" channel. When a
 * subscriber calls
 *
 *   notificationModuleService.createNotifications({
 *     to, channel: "email", template: "<slug>", data: { … }
 *   })
 *
 * Medusa routes the call here. We:
 *   1. Fetch the EmailTemplate row by slug via the polemarch_communication module.
 *   2. Load + decrypt the SMTP config.
 *   3. Compile subject + html with Handlebars against `data`.
 *   4. Send via nodemailer.
 *   5. Write an EmailLog row (never throws — logging failures never break
 *      the send path).
 *
 * The transporter is cached per unique (host, port, user) so we don't
 * re-open an auth session on every send. The cache is invalidated by
 * comparing a signature string built from the current config.
 */
class EmailProviderService extends AbstractNotificationProviderService {
    static identifier = "polemarch-smtp"

    protected readonly logger_: Logger
    protected readonly emailModule_: EmailModuleService
    protected cachedTransporter_: Transporter | null = null
    protected cachedSignature_: string | null = null

    constructor(deps: InjectedDependencies, _options: Options) {
        super()
        this.logger_ = deps.logger
        this.emailModule_ = deps[POLEMARCH_EMAIL_MODULE]
    }

    private async getTransporter(): Promise<{
        transporter: Transporter
        from: string
        reply_to: string | null
    } | null> {
        const cfg = await this.emailModule_.getSmtpConfigDecrypted()
        if (!cfg || !cfg.enabled || !cfg.host || !cfg.from_email) return null

        const signature = JSON.stringify({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            user: cfg.username,
        })

        if (this.cachedTransporter_ && this.cachedSignature_ === signature) {
            const from = cfg.from_name
                ? `"${cfg.from_name}" <${cfg.from_email}>`
                : cfg.from_email
            return { transporter: this.cachedTransporter_, from, reply_to: cfg.reply_to }
        }

        const transporter = nodemailer.createTransport({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            auth:
                cfg.username && cfg.password
                    ? { user: cfg.username, pass: cfg.password }
                    : undefined,
        })

        this.cachedTransporter_ = transporter
        this.cachedSignature_ = signature

        const from = cfg.from_name
            ? `"${cfg.from_name}" <${cfg.from_email}>`
            : cfg.from_email
        return { transporter, from, reply_to: cfg.reply_to }
    }

    async send(
        notification: ProviderSendNotificationDTO
    ): Promise<ProviderSendNotificationResultsDTO> {
        const to = notification.to
        const slug = notification.template
        const data = (notification.data ?? {}) as Record<string, any>

        if (!to || !slug) {
            await this.emailModule_.logEmail({
                to_email: to || "(missing)",
                template_slug: slug || null,
                status: "skipped",
                error: "missing to or template",
                meta: { data },
            })
            return {}
        }

        const template = await this.emailModule_.getTemplateBySlug(slug)
        if (!template) {
            await this.emailModule_.logEmail({
                to_email: to,
                template_slug: slug,
                status: "failed",
                error: `template "${slug}" not found`,
                meta: { data },
            })
            this.logger_?.warn?.(`[polemarch-smtp] template "${slug}" not found`)
            return {}
        }

        let renderedSubject: string
        let renderedHtml: string
        try {
            renderedSubject = Handlebars.compile(template.subject || "", { noEscape: false })(data)
            renderedHtml = Handlebars.compile(template.html || "", { noEscape: true })(data)
        } catch (err: any) {
            await this.emailModule_.logEmail({
                to_email: to,
                template_slug: slug,
                status: "failed",
                error: `render failed: ${err?.message || String(err)}`,
                meta: { data },
            })
            return {}
        }

        const t = await this.getTransporter()
        if (!t) {
            await this.emailModule_.logEmail({
                to_email: to,
                template_slug: slug,
                subject: renderedSubject,
                status: "skipped",
                error: "smtp not configured or disabled",
                meta: { data },
            })
            return {}
        }

        try {
            const result = await t.transporter.sendMail({
                from: t.from,
                to,
                subject: renderedSubject,
                html: renderedHtml,
                replyTo: t.reply_to ?? undefined,
            })
            await this.emailModule_.logEmail({
                to_email: to,
                template_slug: slug,
                subject: renderedSubject,
                status: "sent",
                provider_message_id: result.messageId || null,
                meta: {
                    accepted: result.accepted,
                    rejected: result.rejected,
                    response: result.response,
                    context_keys: Object.keys(data),
                },
            })
            return { id: result.messageId }
        } catch (err: any) {
            // If the transport itself fails (auth, DNS, etc.), invalidate the
            // cache so the next attempt reconnects.
            this.cachedTransporter_ = null
            this.cachedSignature_ = null
            await this.emailModule_.logEmail({
                to_email: to,
                template_slug: slug,
                subject: renderedSubject,
                status: "failed",
                error: err?.message || String(err),
                meta: { data },
            })
            this.logger_?.error?.(
                `[polemarch-smtp] sendMail failed for ${to} (${slug}): ${err?.message}`
            )
            return {}
        }
    }
}

export default EmailProviderService
