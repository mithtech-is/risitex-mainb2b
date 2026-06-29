import { MedusaService } from "@medusajs/framework/utils"
import nodemailer, { type Transporter } from "nodemailer"
import Handlebars from "handlebars"
import { createHash, randomBytes, randomInt } from "node:crypto"
import { SmtpConfig } from "./models/smtp-config"
import { EmailTemplate } from "./models/email-template"
import { EmailLog } from "./models/email-log"
import { EventTemplateMap } from "./models/event-template-map"
import { Msg91Config } from "./models/msg91-config"
import { PolyginConfig } from "./models/polygin-config"
import { SmsLog } from "./models/sms-log"
import { WhatsappLog } from "./models/whatsapp-log"
import { OtpRequest } from "./models/otp-request"
import { WhatsappTemplate } from "./models/whatsapp-template"
import { SmsTemplate } from "./models/sms-template"
import { WhatsappEventMap } from "./models/whatsapp-event-map"
import { BrandConfig } from "./models/brand-config"
import { encryptString, decryptString } from "../cashfree_wallet/cashfree/crypto"
import { DEFAULT_WHATSAPP_TEMPLATES } from "./seed/default-whatsapp-templates"
import { DEFAULT_WHATSAPP_EVENT_MAPS } from "./seed/default-whatsapp-event-maps"
import { DEFAULT_SMS_TEMPLATES } from "./seed/default-sms-templates"

const SINGLETON_ID = "default"

/**
 * Whitelist of `data.*` keys we're comfortable persisting into the
 * email_log `meta` column. Everything else is dropped — the column
 * was previously storing full Handlebars contexts, which included
 * password-reset tokens, customer PAN / Aadhaar, bank numbers, etc.
 * A DB read should not be enough to take over accounts or exfiltrate
 * PII.
 *
 * If you need a new context key visible in the admin log viewer, add
 * it here — with the explicit check that it does NOT contain a
 * secret / one-time token / full PII.
 */
const SAFE_META_CONTEXT_KEYS = new Set<string>([
    "customer_id",
    "order_id",
    "cart_id",
    "template_slug",
    "first_item_handle",
    "direction",
    "amount_inr",
    "total_inr",
    "credited_amount_inr",
    "claimed_amount_inr",
    "flag_count",
    "context_keys", // provider telemetry we already write
    "accepted",
    "rejected",
    "response",
    "source",
])

/** Keys allowed at the top level of the meta blob. */
const SAFE_META_TOP_KEYS = new Set<string>([
    "accepted",
    "rejected",
    "response",
    "context_keys",
    "source",
])

/**
 * Map every brand placeholder name → resolved string. Sensible defaults
 * for the two required fields (brand_name, storefront_url) so freshly
 * installed instances render reasonable text before the admin saves
 * a BrandConfig row. Nullable fields fall back to "" — which makes
 * `{{support_phone}}` etc. disappear cleanly when not configured.
 */
function brandReplacementMap(
    brand: {
        brand_name?: string
        company_name?: string | null
        storefront_url?: string
        support_email?: string | null
        support_phone?: string | null
        address?: string | null
        tagline?: string | null
        whatsapp_bot_label?: string | null
    } | null
        | undefined,
): Record<string, string> {
    const botLabel = brand?.whatsapp_bot_label || "Initiate Bot"
    return {
        brand: brand?.brand_name || "Risitex",
        company_name: brand?.company_name || brand?.brand_name || "Risitex",
        storefront_url: brand?.storefront_url || "https://risitex.com",
        support_email: brand?.support_email || "",
        support_phone: brand?.support_phone || "",
        address: brand?.address || "",
        tagline: brand?.tagline || "",
        whatsapp_bot: botLabel,
        // Polygin's WhatsApp Business number — used by the URL form of
        // the bot button (Meta sometimes blocks QUICK_REPLY when mixed
        // with URL buttons in the same template, so we default to a
        // wa.me link). No leading "+", just digits.
        whatsapp_bot_phone: "918277540332",
        // URL-encoded form of the bot label so substituting it inside
        // a URL like https://wa.me/<phone>?text=... produces a valid
        // URL ("Initiate Bot" → "Initiate%20Bot").
        whatsapp_bot_url: encodeURIComponent(botLabel),
    }
}

/**
 * Inject (or strip) the `{{whatsapp_bot}}` QUICK_REPLY button + the
 * "For more info, click '{{whatsapp_bot}}'." footer for a WhatsApp
 * template, based on the brand's `whatsapp_bot_categories` setting.
 *
 * - If the template's category is in the enabled set: the bot button
 *   gets appended to BUTTONS (creating the BUTTONS component if absent),
 *   and the FOOTER is replaced with the bot pointer line.
 * - If the category is NOT in the enabled set: any existing bot button
 *   is removed from BUTTONS, and a bot-pointer FOOTER is replaced with
 *   the seed's original footer (or removed entirely if seed had none).
 *
 * Brand placeholder substitution still happens later (at copy/push
 * time) — this helper just operates on the unresolved template shape.
 */
function applyBotButton(
    components: any[],
    category: string,
    enabledCategories: Set<string>,
): any[] {
    const BOT_FOOTER_TEXT = "For more info, click '{{whatsapp_bot}}'."
    // URL form of the bot button — opens a wa.me chat to the Polygin
    // number with the bot label pre-filled. Sidesteps Meta's
    // sometimes-spotty handling of QUICK_REPLY + URL mixed buttons.
    const BOT_BUTTON_URL =
        "https://wa.me/{{whatsapp_bot_phone}}?text={{whatsapp_bot_url}}"
    const BOT_BUTTON = {
        type: "URL",
        text: "{{whatsapp_bot}}",
        url: BOT_BUTTON_URL,
    }
    const isEnabled = enabledCategories.has(category)

    // Identify bot button by URL pattern (matches BOT_BUTTON.url) OR
    // by the legacy QUICK_REPLY shape we used to inject. Either way
    // strip it so we apply a clean result regardless of prior runs.
    const isBotButton = (b: any): boolean => {
        if (!b) return false
        if (b.type === "QUICK_REPLY" && b.text === "{{whatsapp_bot}}")
            return true
        if (b.type === "URL" && typeof b.url === "string" && b.url.includes("{{whatsapp_bot_phone}}"))
            return true
        return false
    }
    const cleaned = (components || []).flatMap((c: any) => {
        if (c?.type === "FOOTER" && c?.text === BOT_FOOTER_TEXT) return []
        if (c?.type === "BUTTONS" && Array.isArray(c.buttons)) {
            const buttons = c.buttons.filter((b: any) => !isBotButton(b))
            return buttons.length === 0 ? [] : [{ ...c, buttons }]
        }
        return [c]
    })

    if (!isEnabled) return cleaned

    // Inject BOT_BUTTON into BUTTONS (or create a fresh BUTTONS).
    const idx = cleaned.findIndex((c: any) => c?.type === "BUTTONS")
    let withButton: any[]
    if (idx >= 0) {
        const existing = cleaned[idx]
        // Meta caps total buttons at 3 — drop the LAST button to make
        // room rather than refusing the bot button.
        const buttons = Array.isArray(existing.buttons)
            ? existing.buttons.slice()
            : []
        if (buttons.length >= 3) buttons.pop()
        buttons.push(BOT_BUTTON)
        withButton = cleaned.slice()
        withButton[idx] = { ...existing, buttons }
    } else {
        withButton = [...cleaned, { type: "BUTTONS", buttons: [BOT_BUTTON] }]
    }

    // Inject (or replace) FOOTER with the bot-pointer line.
    const fIdx = withButton.findIndex((c: any) => c?.type === "FOOTER")
    if (fIdx >= 0) {
        withButton[fIdx] = { ...withButton[fIdx], text: BOT_FOOTER_TEXT }
    } else {
        // Footer must come before BUTTONS in Meta's ordering.
        const bIdx = withButton.findIndex((c: any) => c?.type === "BUTTONS")
        const insertAt = bIdx >= 0 ? bIdx : withButton.length
        withButton.splice(insertAt, 0, {
            type: "FOOTER",
            text: BOT_FOOTER_TEXT,
        })
    }
    return withButton
}

function scrubMeta(meta: unknown): Record<string, unknown> | null {
    if (meta == null || typeof meta !== "object") return null
    const src = meta as Record<string, unknown>
    const out: Record<string, unknown> = {}

    // Top-level telemetry keys (from the nodemailer send call)
    for (const key of SAFE_META_TOP_KEYS) {
        if (key in src) out[key] = src[key]
    }

    // The original Handlebars context — only the allowlisted subset
    if (src.data && typeof src.data === "object") {
        const srcData = src.data as Record<string, unknown>
        const scrubbedData: Record<string, unknown> = {}
        for (const key of Object.keys(srcData)) {
            if (SAFE_META_CONTEXT_KEYS.has(key)) {
                scrubbedData[key] = srcData[key]
            }
        }
        // Record WHICH keys were present so ops can debug a send that
        // silently dropped a value — without actually leaking the value.
        scrubbedData["_original_keys"] = Object.keys(srcData).sort()
        out.data = scrubbedData
    }

    return Object.keys(out).length === 0 ? null : out
}

/**
 * Build a crude plain-text fallback from HTML. Intentionally simple —
 * we're not trying to preserve formatting, we're trying to avoid
 * Gmail's "HTML-only body" spam heuristic. Keeps link URLs inline so
 * a plain-text reader can still click through.
 */
function htmlToPlainText(html: string): string {
    return (
        html
            // Make anchors readable: "Text (https://…)" instead of just "Text"
            .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
            // Line breaks for common block-level tags
            .replace(/<br\s*\/?\s*>/gi, "\n")
            .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article|header|footer)>/gi, "\n")
            // Strip every remaining tag
            .replace(/<[^>]+>/g, "")
            // Decode a few common entities
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            // Collapse whitespace runs
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim()
    )
}

export type SmtpConfigView = {
    configured: boolean
    host: string | null
    port: number
    secure: boolean
    username: string | null
    password_set: boolean
    from_name: string | null
    from_email: string | null
    reply_to: string | null
    enabled: boolean
    last_test_at: string | Date | null
    last_test_ok: boolean | null
    last_test_error: string | null
}

export type SmtpConfigInput = {
    host?: string
    port?: number
    secure?: boolean
    username?: string | null
    /** Plain text password. Empty string → leave existing; null → clear. */
    password?: string | null
    from_name?: string | null
    from_email?: string
    reply_to?: string | null
    enabled?: boolean
}

export type DecryptedSmtpConfig = {
    host: string
    port: number
    secure: boolean
    username: string | null
    password: string | null
    from_email: string
    from_name: string | null
    reply_to: string | null
    enabled: boolean
}

export type SendEmailResult =
    | { ok: true; message_id: string | null }
    | { ok: false; reason: string }

class CommunicationModuleService extends MedusaService({
    SmtpConfig,
    EmailTemplate,
    EmailLog,
    EventTemplateMap,
    Msg91Config,
    PolyginConfig,
    SmsLog,
    WhatsappLog,
    OtpRequest,
    WhatsappTemplate,
    SmsTemplate,
    WhatsappEventMap,
    BrandConfig,
}) {
    /**
     * nodemailer transporter cache — keyed on a signature string of the
     * currently-configured SMTP (host/port/secure/user). Invalidated on
     * signature change or on any send failure so the next attempt
     * reconnects cleanly.
     *
     * Lives on the module (not the notification provider) because the
     * provider container can't DI this module on its own — see
     * `sendEmail()` below.
     */
    private cachedTransporter_: Transporter | null = null
    private cachedSignature_: string | null = null

    /* -------------------------------------------------------------- *
     * SMTP config (singleton keyed on "default")
     * -------------------------------------------------------------- */

    private async loadSmtpRow(): Promise<any | null> {
        const rows = await (this as any).listSmtpConfigs({ id: SINGLETON_ID }, {})
        return rows?.[0] ?? null
    }

    async getSmtpConfigView(): Promise<SmtpConfigView> {
        const row = await this.loadSmtpRow()
        if (!row) {
            return {
                configured: false,
                host: null,
                port: 587,
                secure: false,
                username: null,
                password_set: false,
                from_name: null,
                from_email: null,
                reply_to: null,
                enabled: false,
                last_test_at: null,
                last_test_ok: null,
                last_test_error: null,
            }
        }
        return {
            configured: true,
            host: row.host,
            port: row.port,
            secure: row.secure,
            username: row.username,
            password_set: Boolean(row.password_encrypted),
            from_name: row.from_name,
            from_email: row.from_email,
            reply_to: row.reply_to,
            enabled: row.enabled,
            last_test_at: row.last_test_at,
            last_test_ok: row.last_test_ok,
            last_test_error: row.last_test_error,
        }
    }

    /**
     * Returns the decrypted config for the provider. Never expose this
     * over an HTTP response — it contains the plaintext password.
     */
    async getSmtpConfigDecrypted(): Promise<DecryptedSmtpConfig | null> {
        const row = await this.loadSmtpRow()
        if (!row || !row.host || !row.from_email) return null
        let password: string | null = null
        if (row.password_encrypted) {
            try {
                password = decryptString(row.password_encrypted)
            } catch (err) {
                // Surface decryption failures loudly — a bad key or
                // corrupted row should never silently send auth-less.
                throw new Error(
                    "Couldn't decrypt stored SMTP password. The at-rest encryption key may have rotated — re-enter the password in Email → SMTP settings."
                )
            }
        }
        return {
            host: row.host,
            port: row.port,
            secure: row.secure,
            username: row.username,
            password,
            from_email: row.from_email,
            from_name: row.from_name,
            reply_to: row.reply_to,
            enabled: row.enabled,
        }
    }

    async upsertSmtpConfig(input: SmtpConfigInput): Promise<SmtpConfigView> {
        const existing = await this.loadSmtpRow()

        // Password handling:
        //   undefined / ""  → keep the stored ciphertext
        //   null           → clear the password
        //   string         → re-encrypt and replace
        let password_encrypted: string | null | undefined
        if (input.password === null) {
            password_encrypted = null
        } else if (typeof input.password === "string" && input.password.length > 0) {
            password_encrypted = encryptString(input.password)
        } else {
            password_encrypted = undefined
        }

        const merged: any = {
            id: SINGLETON_ID,
            host: input.host ?? existing?.host ?? "",
            port: input.port ?? existing?.port ?? 587,
            secure: typeof input.secure === "boolean" ? input.secure : existing?.secure ?? false,
            username: input.username ?? existing?.username ?? null,
            from_name: input.from_name ?? existing?.from_name ?? null,
            from_email: input.from_email ?? existing?.from_email ?? "",
            reply_to: input.reply_to ?? existing?.reply_to ?? null,
            enabled:
                typeof input.enabled === "boolean" ? input.enabled : existing?.enabled ?? true,
        }
        if (password_encrypted !== undefined) {
            merged.password_encrypted = password_encrypted
        } else if (existing) {
            merged.password_encrypted = existing.password_encrypted
        } else {
            merged.password_encrypted = null
        }

        if (existing) {
            await (this as any).updateSmtpConfigs(merged)
        } else {
            await (this as any).createSmtpConfigs(merged)
        }

        return this.getSmtpConfigView()
    }

    async recordTestResult(ok: boolean, error: string | null): Promise<void> {
        const existing = await this.loadSmtpRow()
        if (!existing) return
        await (this as any).updateSmtpConfigs({
            id: SINGLETON_ID,
            last_test_at: new Date(),
            last_test_ok: ok,
            last_test_error: error,
        })
    }

    /* -------------------------------------------------------------- *
     * Templates
     * -------------------------------------------------------------- */

    async getTemplateBySlug(slug: string) {
        const rows = await (this as any).listEmailTemplates({ slug })
        return rows?.[0] ?? null
    }

    /* -------------------------------------------------------------- *
     * Event → template mapping
     * -------------------------------------------------------------- */

    async getEventMapping(event_name: string) {
        const rows = await (this as any).listEventTemplateMaps({ event_name })
        return rows?.[0] ?? null
    }

    async upsertEventMapping(input: {
        event_name: string
        template_slug: string
        to_resolver?: "customer_email" | "admin_email" | "static"
        static_to?: string | null
        enabled?: boolean
    }) {
        const existing = await this.getEventMapping(input.event_name)
        if (existing) {
            await (this as any).updateEventTemplateMaps({
                id: existing.id,
                template_slug: input.template_slug,
                to_resolver: input.to_resolver ?? existing.to_resolver,
                static_to: input.static_to ?? existing.static_to,
                enabled:
                    typeof input.enabled === "boolean" ? input.enabled : existing.enabled,
            })
            return this.getEventMapping(input.event_name)
        }
        await (this as any).createEventTemplateMaps({
            event_name: input.event_name,
            template_slug: input.template_slug,
            to_resolver: input.to_resolver ?? "customer_email",
            static_to: input.static_to ?? null,
            enabled: typeof input.enabled === "boolean" ? input.enabled : true,
        })
        return this.getEventMapping(input.event_name)
    }

    /* -------------------------------------------------------------- *
     * Logs
     * -------------------------------------------------------------- */

    async logEmail(row: {
        to_email: string
        template_slug?: string | null
        subject?: string | null
        status: "sent" | "failed" | "skipped"
        error?: string | null
        provider_message_id?: string | null
        meta?: any
    }) {
        try {
            await (this as any).createEmailLogs({
                to_email: row.to_email,
                template_slug: row.template_slug ?? null,
                subject: row.subject ?? null,
                status: row.status,
                error: row.error ?? null,
                provider_message_id: row.provider_message_id ?? null,
                // Scrub the Handlebars context before persisting — it
                // can contain password-reset tokens, OTPs, full PII
                // (PAN, Aadhaar, bank numbers), wallet balances, etc.
                // We only keep a fixed allowlist of identifiers +
                // provider telemetry (accepted / rejected / response).
                meta: scrubMeta(row.meta) ?? null,
            })
        } catch (err) {
            // Logging failures must never break the send pipeline.
            console.error("[polemarch_email] failed to write EmailLog:", err)
        }
    }

    /* -------------------------------------------------------------- *
     * Direct send — bypasses Medusa's Notification Module.
     *
     * Why: the `polemarch-smtp` notification provider runs in a child
     * container that can't DI this module (AwilixResolutionError:
     * "Could not resolve 'polemarch_email'"). Subscribers that called
     * `notificationModule.createNotifications({...})` therefore always
     * failed at send-time. This method does the template + SMTP work
     * in the subscriber's own container, where the module is already
     * resolved, so it Just Works.
     *
     * The notification provider is kept around for any callers that
     * invoke it directly, but the primary path is now this method,
     * invoked via the `sendEventEmail` helper.
     *
     * Contract:
     *   - never throws (matches sendEventEmail's "business flow first")
     *   - always writes an EmailLog row (sent | failed | skipped)
     *   - caches the nodemailer transporter per unique SMTP signature
     * -------------------------------------------------------------- */
    async sendEmail(input: {
        to: string
        template_slug: string
        data?: Record<string, any>
    }): Promise<SendEmailResult> {
        const { to, template_slug, data = {} } = input

        if (!to || !template_slug) {
            await this.logEmail({
                to_email: to || "(missing)",
                template_slug: template_slug || null,
                status: "skipped",
                error: "missing to or template_slug",
                meta: { data },
            })
            return { ok: false, reason: "missing to or template_slug" }
        }

        const template = await this.getTemplateBySlug(template_slug)
        if (!template) {
            await this.logEmail({
                to_email: to,
                template_slug,
                status: "failed",
                error: `template "${template_slug}" not found`,
                meta: { data },
            })
            return { ok: false, reason: `template "${template_slug}" not found` }
        }

        let renderedSubject: string
        let renderedHtml: string
        try {
            renderedSubject = Handlebars.compile(template.subject || "", { noEscape: false })(data)
            renderedHtml = Handlebars.compile(template.html || "", { noEscape: true })(data)
        } catch (err: any) {
            const msg = err?.message || String(err)
            await this.logEmail({
                to_email: to,
                template_slug,
                status: "failed",
                error: `render failed: ${msg}`,
                meta: { data },
            })
            return { ok: false, reason: `render failed: ${msg}` }
        }

        const transport = await this.getOrCreateTransport()
        if (!transport) {
            await this.logEmail({
                to_email: to,
                template_slug,
                subject: renderedSubject,
                status: "skipped",
                error: "smtp not configured or disabled",
                meta: { data },
            })
            return { ok: false, reason: "smtp not configured or disabled" }
        }

        // Derive a plain-text fallback from the HTML. HTML-only email
        // without a `text/plain` alternative is a strong spam-score
        // signal in Gmail / Outlook — messages with reset links then
        // often silently go to Spam even when the SMTP handshake was
        // clean. Adding the alt-part drops the score and lets the same
        // send land in the inbox.
        const plainText = htmlToPlainText(renderedHtml)

        try {
            // Match the admin "test email" code path exactly — subject
            // + text + html + replyTo, nothing more. We previously added
            // `Auto-Submitted: auto-generated` + `X-Entity-Ref-ID`
            // headers thinking they'd be "transactional hints". They
            // actually cause Gmail to route mail to the Updates /
            // Promotions tabs or Spam instead of Primary, and were the
            // only behavioural difference between the working admin
            // test send and this code path. Keep this minimal.
            const result = await transport.transporter.sendMail({
                from: transport.from,
                to,
                subject: renderedSubject,
                html: renderedHtml,
                text: plainText,
                replyTo: transport.reply_to ?? undefined,
            })
            await this.logEmail({
                to_email: to,
                template_slug,
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
            return { ok: true, message_id: result.messageId || null }
        } catch (err: any) {
            // Invalidate the cache so the next attempt reconnects.
            this.cachedTransporter_ = null
            this.cachedSignature_ = null
            const msg = err?.message || String(err)
            await this.logEmail({
                to_email: to,
                template_slug,
                subject: renderedSubject,
                status: "failed",
                error: msg,
                meta: { data },
            })
            return { ok: false, reason: msg }
        }
    }

    /**
     * Build (or reuse) a nodemailer transporter matching the current
     * SMTP config. Returns null when SMTP isn't configured or is
     * disabled — callers then log the attempt as `skipped`.
     */
    private async getOrCreateTransport(): Promise<{
        transporter: Transporter
        from: string
        reply_to: string | null
    } | null> {
        const cfg = await this.getSmtpConfigDecrypted()
        if (!cfg || !cfg.enabled || !cfg.host || !cfg.from_email) return null

        const signature = JSON.stringify({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            user: cfg.username,
        })

        const from = cfg.from_name
            ? `"${cfg.from_name}" <${cfg.from_email}>`
            : cfg.from_email

        if (this.cachedTransporter_ && this.cachedSignature_ === signature) {
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

        return { transporter, from, reply_to: cfg.reply_to }
    }

    /* ============================================================== *
     * MSG91 SMS gateway
     * ============================================================== */

    private async loadMsg91Row(): Promise<any | null> {
        const rows = await (this as any).listMsg91Configs(
            { id: SINGLETON_ID },
            {},
        )
        return rows?.[0] ?? null
    }

    async getMsg91ConfigView(): Promise<{
        configured: boolean
        auth_key_set: boolean
        sender_id: string | null
        sms_template_id: string | null
        otp_template_id: string | null
        enabled: boolean
        last_test_at: string | Date | null
        last_test_ok: boolean | null
        last_test_error: string | null
    }> {
        const row = await this.loadMsg91Row()
        if (!row) {
            return {
                configured: false,
                auth_key_set: false,
                sender_id: null,
                sms_template_id: null,
                otp_template_id: null,
                enabled: false,
                last_test_at: null,
                last_test_ok: null,
                last_test_error: null,
            }
        }
        return {
            configured: true,
            auth_key_set: Boolean(row.auth_key_encrypted),
            sender_id: row.sender_id,
            sms_template_id: row.sms_template_id,
            otp_template_id: row.otp_template_id,
            enabled: row.enabled,
            last_test_at: row.last_test_at,
            last_test_ok: row.last_test_ok,
            last_test_error: row.last_test_error,
        }
    }

    async getMsg91ConfigDecrypted(): Promise<{
        auth_key: string | null
        sender_id: string | null
        sms_template_id: string | null
        otp_template_id: string | null
        enabled: boolean
    } | null> {
        const row = await this.loadMsg91Row()
        if (!row) return null
        let auth_key: string | null = null
        if (row.auth_key_encrypted) {
            try {
                auth_key = decryptString(row.auth_key_encrypted)
            } catch (err) {
                throw new Error(
                    "Couldn't decrypt stored MSG91 auth key. The at-rest encryption key may have rotated — re-enter the auth key in Communication → SMS settings.",
                )
            }
        }
        return {
            auth_key,
            sender_id: row.sender_id,
            sms_template_id: row.sms_template_id,
            otp_template_id: row.otp_template_id,
            enabled: row.enabled,
        }
    }

    async upsertMsg91Config(input: {
        auth_key?: string | null
        sender_id?: string | null
        sms_template_id?: string | null
        otp_template_id?: string | null
        enabled?: boolean
    }): Promise<ReturnType<typeof this.getMsg91ConfigView>> {
        const existing = await this.loadMsg91Row()

        // Same secret-handling rule as SMTP: undefined / "" → keep
        // stored ciphertext, null → clear, non-empty string → encrypt.
        let auth_key_encrypted: string | null | undefined
        if (input.auth_key === null) {
            auth_key_encrypted = null
        } else if (
            typeof input.auth_key === "string" &&
            input.auth_key.length > 0
        ) {
            auth_key_encrypted = encryptString(input.auth_key)
        } else {
            auth_key_encrypted = undefined
        }

        const merged: any = {
            id: SINGLETON_ID,
            sender_id: input.sender_id ?? existing?.sender_id ?? null,
            sms_template_id:
                input.sms_template_id ?? existing?.sms_template_id ?? null,
            otp_template_id:
                input.otp_template_id ?? existing?.otp_template_id ?? null,
            enabled:
                typeof input.enabled === "boolean"
                    ? input.enabled
                    : existing?.enabled ?? true,
        }
        if (auth_key_encrypted !== undefined) {
            merged.auth_key_encrypted = auth_key_encrypted
        } else if (existing) {
            merged.auth_key_encrypted = existing.auth_key_encrypted
        } else {
            merged.auth_key_encrypted = null
        }

        if (existing) {
            await (this as any).updateMsg91Configs(merged)
        } else {
            await (this as any).createMsg91Configs(merged)
        }
        return this.getMsg91ConfigView()
    }

    async recordMsg91TestResult(
        ok: boolean,
        error: string | null,
    ): Promise<void> {
        const existing = await this.loadMsg91Row()
        if (!existing) return
        await (this as any).updateMsg91Configs({
            id: SINGLETON_ID,
            last_test_at: new Date(),
            last_test_ok: ok,
            last_test_error: error,
        })
    }

    /* ============================================================== *
     * Polygin WhatsApp gateway
     * ============================================================== */

    private async loadPolyginRow(): Promise<any | null> {
        const rows = await (this as any).listPolyginConfigs(
            { id: SINGLETON_ID },
            {},
        )
        return rows?.[0] ?? null
    }

    async getPolyginConfigView(): Promise<{
        configured: boolean
        token_set: boolean
        dashboard_token_set: boolean
        sender_phone: string | null
        test_phone: string | null
        enabled: boolean
        last_test_at: string | Date | null
        last_test_ok: boolean | null
        last_test_error: string | null
    }> {
        const row = await this.loadPolyginRow()
        if (!row) {
            return {
                configured: false,
                token_set: false,
                dashboard_token_set: false,
                sender_phone: null,
                test_phone: null,
                enabled: false,
                last_test_at: null,
                last_test_ok: null,
                last_test_error: null,
            }
        }
        return {
            configured: true,
            token_set: Boolean(row.token_encrypted),
            dashboard_token_set: Boolean(row.dashboard_token_encrypted),
            sender_phone: row.sender_phone,
            test_phone: row.test_phone ?? null,
            enabled: row.enabled,
            last_test_at: row.last_test_at,
            last_test_ok: row.last_test_ok,
            last_test_error: row.last_test_error,
        }
    }

    async getPolyginConfigDecrypted(): Promise<{
        token: string | null
        dashboard_token: string | null
        sender_phone: string | null
        enabled: boolean
    } | null> {
        const row = await this.loadPolyginRow()
        if (!row) return null
        let token: string | null = null
        let dashboard_token: string | null = null
        if (row.token_encrypted) {
            try {
                token = decryptString(row.token_encrypted)
            } catch (err) {
                throw new Error(
                    "Couldn't decrypt stored Polygin REST API token. The at-rest encryption key may have rotated — re-enter the token in Communication → WhatsApp settings.",
                )
            }
        }
        if (row.dashboard_token_encrypted) {
            try {
                dashboard_token = decryptString(row.dashboard_token_encrypted)
            } catch (err) {
                throw new Error(
                    "Couldn't decrypt stored Polygin dashboard token. The at-rest encryption key may have rotated — re-enter it in Communication → WhatsApp settings.",
                )
            }
        }
        return {
            token,
            dashboard_token,
            sender_phone: row.sender_phone,
            enabled: row.enabled,
        }
    }

    async upsertPolyginConfig(input: {
        token?: string | null
        dashboard_token?: string | null
        sender_phone?: string | null
        test_phone?: string | null
        enabled?: boolean
    }): Promise<ReturnType<typeof this.getPolyginConfigView>> {
        const existing = await this.loadPolyginRow()

        // Same secret-handling rule as SMTP password / MSG91 auth_key:
        //   undefined / "" → keep existing
        //   null           → clear
        //   string         → encrypt + replace
        const encryptOrSentinel = (
            value: string | null | undefined,
        ): string | null | undefined => {
            if (value === null) return null
            if (typeof value === "string" && value.length > 0)
                return encryptString(value)
            return undefined
        }
        const token_encrypted = encryptOrSentinel(input.token)
        const dashboard_token_encrypted = encryptOrSentinel(
            input.dashboard_token,
        )

        const merged: any = {
            id: SINGLETON_ID,
            sender_phone: input.sender_phone ?? existing?.sender_phone ?? null,
            test_phone:
                input.test_phone === undefined
                    ? existing?.test_phone ?? null
                    : input.test_phone,
            enabled:
                typeof input.enabled === "boolean"
                    ? input.enabled
                    : existing?.enabled ?? true,
        }
        if (token_encrypted !== undefined) {
            merged.token_encrypted = token_encrypted
        } else if (existing) {
            merged.token_encrypted = existing.token_encrypted
        } else {
            merged.token_encrypted = null
        }
        if (dashboard_token_encrypted !== undefined) {
            merged.dashboard_token_encrypted = dashboard_token_encrypted
        } else if (existing) {
            merged.dashboard_token_encrypted = existing.dashboard_token_encrypted
        } else {
            merged.dashboard_token_encrypted = null
        }

        if (existing) {
            await (this as any).updatePolyginConfigs(merged)
        } else {
            await (this as any).createPolyginConfigs(merged)
        }
        return this.getPolyginConfigView()
    }

    async recordPolyginTestResult(
        ok: boolean,
        error: string | null,
    ): Promise<void> {
        const existing = await this.loadPolyginRow()
        if (!existing) return
        await (this as any).updatePolyginConfigs({
            id: SINGLETON_ID,
            last_test_at: new Date(),
            last_test_ok: ok,
            last_test_error: error,
        })
    }

    /* ============================================================== *
     * Send routers — WhatsApp (primary) → SMS (fallback)
     * ============================================================== */

    /**
     * Send a WhatsApp text message via Polygin.
     *
     * Contract: never throws. Returns `{ok: true, message_id}` on
     * success, `{ok: false, reason}` otherwise. Always writes a
     * WhatsappLog row.
     */
    async sendWhatsapp(input: {
        to: string
        text: string
        otp_request_id?: string | null
    }): Promise<
        | { ok: true; message_id: string | null }
        | { ok: false; reason: string }
    > {
        const { to, text, otp_request_id = null } = input

        if (!to || !text) {
            await this.logWhatsapp({
                to_phone: to || "(missing)",
                body: text || null,
                status: "skipped",
                error: "missing to or text",
                otp_request_id,
            })
            return { ok: false, reason: "missing to or text" }
        }

        const cfg = await this.getPolyginConfigDecrypted()
        if (!cfg || !cfg.enabled || !cfg.token || !cfg.sender_phone) {
            await this.logWhatsapp({
                to_phone: to,
                body: text,
                status: "skipped",
                error: "polygin not configured or disabled",
                otp_request_id,
            })
            return { ok: false, reason: "polygin not configured or disabled" }
        }

        try {
            const res = await fetch(
                "https://polyg.in/api/qr/rest/send_message",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${cfg.token}`,
                    },
                    body: JSON.stringify({
                        messageType: "text",
                        requestType: "POST",
                        token: cfg.token,
                        from: cfg.sender_phone,
                        to,
                        text,
                    }),
                },
            )
            const body: any = await res
                .json()
                .catch(() => ({ success: false, message: "non-json body" }))
            const ok = res.ok && body?.success === true
            if (!ok) {
                const reason =
                    body?.message ||
                    `polygin HTTP ${res.status}` ||
                    "polygin error"
                await this.logWhatsapp({
                    to_phone: to,
                    body: text,
                    status: "failed",
                    error: reason,
                    otp_request_id,
                    meta: {
                        http_status: res.status,
                        provider_response: body,
                    },
                })
                return { ok: false, reason }
            }
            const messageId =
                body?.data?.messageId ?? body?.messageId ?? null
            await this.logWhatsapp({
                to_phone: to,
                body: text,
                status: "sent",
                provider_message_id: messageId,
                otp_request_id,
                meta: {
                    http_status: res.status,
                    response_summary: body?.message || null,
                },
            })
            return { ok: true, message_id: messageId }
        } catch (err: any) {
            const reason = err?.message || String(err)
            await this.logWhatsapp({
                to_phone: to,
                body: text,
                status: "failed",
                error: reason,
                otp_request_id,
            })
            return { ok: false, reason }
        }
    }

    /**
     * Send an SMS via MSG91 Flow API.
     *
     * Optionally accepts `dlt_template_id` — when set it overrides the
     * default `sms_template_id` from the config (used by the OTP path
     * to swap in `otp_template_id`).
     *
     * Contract: never throws. Always writes a SmsLog row.
     */
    async sendSms(input: {
        to: string
        body: string
        dlt_template_id?: string | null
        otp_request_id?: string | null
    }): Promise<
        | { ok: true; message_id: string | null }
        | { ok: false; reason: string }
    > {
        const { to, body, dlt_template_id = null, otp_request_id = null } = input

        if (!to || !body) {
            await this.logSms({
                to_phone: to || "(missing)",
                body: body || null,
                status: "skipped",
                error: "missing to or body",
                otp_request_id,
            })
            return { ok: false, reason: "missing to or body" }
        }

        const cfg = await this.getMsg91ConfigDecrypted()
        const template_id = dlt_template_id || cfg?.sms_template_id || null
        if (
            !cfg ||
            !cfg.enabled ||
            !cfg.auth_key ||
            !cfg.sender_id ||
            !template_id
        ) {
            await this.logSms({
                to_phone: to,
                body,
                status: "skipped",
                error: "msg91 not configured or disabled",
                otp_request_id,
            })
            return { ok: false, reason: "msg91 not configured or disabled" }
        }

        // MSG91 wants the mobile number without the leading `+`. Strip it.
        const mobile = to.startsWith("+") ? to.slice(1) : to

        try {
            const res = await fetch(
                "https://control.msg91.com/api/v5/flow/",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        accept: "application/json",
                        authkey: cfg.auth_key,
                    },
                    body: JSON.stringify({
                        template_id,
                        sender: cfg.sender_id,
                        short_url: "0",
                        recipients: [{ mobiles: mobile, var1: body }],
                    }),
                },
            )
            const json: any = await res
                .json()
                .catch(() => ({ type: "error", message: "non-json body" }))
            const ok = res.ok && (json?.type === "success" || !!json?.request_id)
            if (!ok) {
                const reason =
                    json?.message ||
                    `msg91 HTTP ${res.status}` ||
                    "msg91 error"
                await this.logSms({
                    to_phone: to,
                    body,
                    status: "failed",
                    error: reason,
                    otp_request_id,
                    meta: {
                        http_status: res.status,
                        provider_response: json,
                        template_id,
                    },
                })
                return { ok: false, reason }
            }
            const requestId = json?.request_id ?? null
            await this.logSms({
                to_phone: to,
                body,
                status: "sent",
                provider_message_id: requestId,
                otp_request_id,
                meta: {
                    http_status: res.status,
                    template_id,
                    response_type: json?.type || null,
                },
            })
            return { ok: true, message_id: requestId }
        } catch (err: any) {
            const reason = err?.message || String(err)
            await this.logSms({
                to_phone: to,
                body,
                status: "failed",
                error: reason,
                otp_request_id,
            })
            return { ok: false, reason }
        }
    }

    /**
     * Send a phone-bound text message — WhatsApp first, SMS fallback.
     *
     * Three-stage fallback:
     *   1. If `template_slug` is provided AND the WhatsappTemplate row is
     *      approved on Meta, send via /api/v1/send_templet (Meta template
     *      path). Highest deliverability for AUTHENTICATION + UTILITY
     *      categories.
     *   2. Free-form WhatsApp via the QR plugin. Works without a Meta
     *      account; the recipient sees a regular WhatsApp message from
     *      the linked QR phone.
     *   3. MSG91 SMS via the Flow API. Uses `dlt_template_id` (or the
     *      Msg91Config default) and the rendered text as var1.
     *
     * Returns the channel that ultimately succeeded.
     */
    async sendPhoneMessage(input: {
        to: string
        text: string
        /** When provided, try the WhatsApp Meta-template path first
         *  (requires the template to be approved on Meta via polyg.in). */
        template_slug?: string | null
        /** Variables to fill the template's {{N}} slots, in order.
         *  Falls through to `text` if the template path isn't available. */
        template_variables?: string[]
        /** Override the SMS DLT template id (defaults to Msg91Config's). */
        dlt_template_id?: string | null
        otp_request_id?: string | null
    }): Promise<{
        ok: boolean
        sent_via: "whatsapp_template" | "whatsapp" | "sms" | "failed"
        whatsapp_template_result?:
            | { ok: true; message_id: string | null }
            | { ok: false; reason: string }
        whatsapp_result?:
            | { ok: true; message_id: string | null }
            | { ok: false; reason: string }
        sms_result?:
            | { ok: true; message_id: string | null }
            | { ok: false; reason: string }
    }> {
        try {
            // 1) Try the Meta-template path if slug provided.
            let waTpl:
                | { ok: true; message_id: string | null }
                | { ok: false; reason: string }
                | null = null
            if (input.template_slug) {
                waTpl = await this.sendWhatsappTemplate({
                    to: input.to,
                    slug: input.template_slug,
                    variables: input.template_variables ?? [],
                    otp_request_id: input.otp_request_id ?? null,
                })
                if (waTpl.ok) {
                    return {
                        ok: true,
                        sent_via: "whatsapp_template",
                        whatsapp_template_result: waTpl,
                    }
                }
            }

            // 2) Free-form WhatsApp via the QR plugin.
            const wa = await this.sendWhatsapp({
                to: input.to,
                text: input.text,
                otp_request_id: input.otp_request_id ?? null,
            })
            if (wa.ok) {
                return {
                    ok: true,
                    sent_via: "whatsapp",
                    whatsapp_template_result: waTpl ?? undefined,
                    whatsapp_result: wa,
                }
            }

            // 3) MSG91 SMS.
            const sms = await this.sendSms({
                to: input.to,
                body: input.text,
                dlt_template_id: input.dlt_template_id ?? null,
                otp_request_id: input.otp_request_id ?? null,
            })
            if (sms.ok) {
                return {
                    ok: true,
                    sent_via: "sms",
                    whatsapp_template_result: waTpl ?? undefined,
                    whatsapp_result: wa,
                    sms_result: sms,
                }
            }

            return {
                ok: false,
                sent_via: "failed",
                whatsapp_template_result: waTpl ?? undefined,
                whatsapp_result: wa,
                sms_result: sms,
            }
        } catch (err: any) {
            console.error("[phone-otp] sendPhoneMessage failed:", err)
            return {
                ok: false,
                sent_via: "failed",
            }
        }
    }

    /* ============================================================== *
     * WhatsApp templates — registry + push to polyg.in / Meta + send
     * ============================================================== */

    async listWhatsappTemplatesView(filters?: {
        category?: string
        polygin_status?: string
    }): Promise<any[]> {
        const fq: any = {}
        if (filters?.category) fq.category = filters.category
        if (filters?.polygin_status) fq.polygin_status = filters.polygin_status
        const rows: any[] = await (this as any).listWhatsappTemplates(
            Object.keys(fq).length ? fq : undefined,
            { order: { created_at: "ASC" } },
        )
        return rows
    }

    async getWhatsappTemplateBySlug(slug: string) {
        const rows: any[] = await (this as any).listWhatsappTemplates({ slug })
        return rows?.[0] ?? null
    }

    async upsertWhatsappTemplate(input: {
        slug: string
        name?: string
        label?: string | null
        description?: string | null
        category?: string
        language?: string
        template_type?: string
        components?: any[]
        variables?: any[] | null
        is_system?: boolean
        /** Manual lifecycle override — admin sets this to "approved"
         *  once Meta approves the matching template on polyg.in's web
         *  UI. */
        polygin_status?: "draft" | "pushed" | "approved" | "rejected" | "paused"
    }): Promise<any> {
        const existing = await this.getWhatsappTemplateBySlug(input.slug)
        const merged: any = {
            slug: input.slug,
            name: input.name ?? existing?.name ?? input.slug.replace(/[^a-z0-9_]/gi, "_").toLowerCase(),
            label: input.label ?? existing?.label ?? null,
            description: input.description ?? existing?.description ?? null,
            category: input.category ?? existing?.category ?? "UTILITY",
            language: input.language ?? existing?.language ?? "en",
            template_type:
                input.template_type ?? existing?.template_type ?? "STANDARD",
            components: input.components ?? existing?.components ?? [],
            variables: input.variables ?? existing?.variables ?? null,
            is_system:
                typeof input.is_system === "boolean"
                    ? input.is_system
                    : existing?.is_system ?? false,
        }
        if (existing) {
            // Editing the body / name / language / category invalidates
            // the Meta-side approval — bump status back to "draft" so
            // the admin recreates the template on polyg.in.
            merged.id = existing.id
            const bodyChanged =
                JSON.stringify(merged.components) !==
                    JSON.stringify(existing.components) ||
                merged.name !== existing.name ||
                merged.language !== existing.language ||
                merged.category !== existing.category
            if (bodyChanged) {
                merged.polygin_status = "draft"
                merged.polygin_template_id = null
                merged.polygin_last_error = null
            }
            // Explicit status override always wins (admin marking a
            // template approved after creating it on polyg.in).
            if (input.polygin_status) {
                merged.polygin_status = input.polygin_status
                if (input.polygin_status === "approved") {
                    merged.polygin_last_error = null
                }
            }
            await (this as any).updateWhatsappTemplates(merged)
            return this.getWhatsappTemplateBySlug(input.slug)
        }
        await (this as any).createWhatsappTemplates({
            ...merged,
            polygin_status: input.polygin_status ?? "draft",
        })
        return this.getWhatsappTemplateBySlug(input.slug)
    }

    /**
     * Render a WhatsApp template's BODY component with variable values.
     *
     * Two-pass substitution:
     *   1. `{{brand}}`, `{{storefront_url}}`, `{{support_email}}` are
     *      resolved from the BrandConfig singleton (push-time / boot-
     *      time defaults). Brand-name placeholders are baked into the
     *      template at PUSH time so Meta sees the actual wording it
     *      will approve.
     *   2. `{{1}}`, `{{2}}`, … are positional variables resolved from
     *      the `variables` array at SEND time.
     *
     * The `brandOverrides` arg lets the push pipeline force a specific
     * brand (e.g. preview the substituted body in the editor without
     * touching the saved row). Pass `null` to let the function pull the
     * config row from the DB.
     */
    async renderWhatsappTemplateBodyAsync(
        template: any,
        variables: string[],
        brandOverrides?: {
            brand_name?: string
            storefront_url?: string
            support_email?: string | null
        } | null,
    ): Promise<string> {
        const bodyComponent = (template.components ?? []).find(
            (c: any) => c?.type === "BODY",
        )
        const text: string = bodyComponent?.text ?? ""
        const brand = brandOverrides ?? (await this.getBrandConfigView())
        return this.resolveBrandAndPositional(text, brand, variables)
    }

    /** Synchronous variant that takes the brand record explicitly.
     *  Used by code paths that already have the brand loaded. */
    renderWhatsappTemplateBody(
        template: any,
        variables: string[],
        brand?: {
            brand_name?: string
            storefront_url?: string
            support_email?: string | null
        } | null,
    ): string {
        const bodyComponent = (template.components ?? []).find(
            (c: any) => c?.type === "BODY",
        )
        const text: string = bodyComponent?.text ?? ""
        return this.resolveBrandAndPositional(text, brand ?? null, variables)
    }

    /** Substitute every brand placeholder ({{brand}}, {{company_name}},
     *  {{storefront_url}}, {{support_email}}, {{support_phone}},
     *  {{address}}, {{tagline}}) followed by positional {{N}} variables.
     *  Brand defaults are filled in if the config record isn't loaded
     *  (e.g. fresh install). */
    private resolveBrandAndPositional(
        text: string,
        brand: {
            brand_name?: string
            company_name?: string | null
            storefront_url?: string
            support_email?: string | null
            support_phone?: string | null
            address?: string | null
            tagline?: string | null
        } | null,
        variables: string[],
    ): string {
        const replacements = brandReplacementMap(brand)
        let result = text
        for (const [placeholder, value] of Object.entries(replacements)) {
            const re = new RegExp(
                `\\{\\{\\s*${placeholder}\\s*\\}\\}`,
                "g",
            )
            result = result.replace(re, value)
        }
        result = result.replace(/\{\{(\d+)\}\}/g, (_, idx) => {
            const n = Number.parseInt(idx, 10) - 1
            return variables[n] ?? ""
        })
        return result
    }

    /**
     * Brand-resolved preview of a template, ready to paste into
     * polyg.in's template editor.
     *
     * Substitutes `{{brand}}`, `{{storefront_url}}`, and
     * `{{support_email}}` against the current BrandConfig but leaves
     * positional `{{1}}`, `{{2}}` slots intact — Meta sees those
     * during template review.
     *
     * Returned shape mirrors the Meta template-create payload (name +
     * category + language + components) so admin can copy each field
     * straight into polyg.in's UI.
     */
    async getWhatsappTemplatePreview(slug: string): Promise<
        | {
              ok: true
              name: string
              category: string
              language: string
              template_type: string
              components: any[]
              /** Position-ordered variable list — index 0 = {{1}}, index
               *  1 = {{2}}, etc. Each entry carries the key (admin-
               *  facing identifier), sample value (what Meta sees during
               *  template review), and optional description. The
               *  Copy-for-polyg.in drawer renders these as paste-ready
               *  rows for Polygin's Variables step. */
              variables: Array<{
                  position: number
                  placeholder: string
                  key: string
                  sample: string
                  description: string | null
                  required: boolean
              }>
              brand: {
                  brand_name: string
                  storefront_url: string
                  support_email: string | null
              }
          }
        | { ok: false; reason: string }
    > {
        const row = await this.getWhatsappTemplateBySlug(slug)
        if (!row) return { ok: false, reason: `template "${slug}" not found` }
        const brand = await this.getBrandConfigView()
        const resolved = this.substituteBrandInComponents(
            row.components || [],
            brand,
        )
        const variables = (row.variables || []).map(
            (v: any, i: number) => ({
                position: i + 1,
                placeholder: `{{${i + 1}}}`,
                key: String(v?.key ?? ""),
                sample: String(v?.sample ?? ""),
                description:
                    typeof v?.description === "string" ? v.description : null,
                required: Boolean(v?.required),
            }),
        )
        return {
            ok: true,
            name: row.name,
            category: row.category,
            language: row.language,
            template_type: row.template_type,
            components: resolved,
            variables,
            brand,
        }
    }

    /**
     * Push a local WhatsApp template to polyg.in for Meta approval.
     *
     * POST https://polyg.in/api/user/add_meta_templet
     *
     * Body shape mirrors Meta's template-create payload + polyg.in's
     * `templateType` wrapper. Authentication uses the DASHBOARD JWT —
     * Polygin's public REST API token is rejected here with "Invalid
     * token". The dashboard JWT is captured by the admin from
     * localStorage.wacrm_user on polyg.in and stored encrypted in
     * PolyginConfig.dashboard_token_encrypted.
     *
     * On success the local row flips to "pushed". Meta review is
     * asynchronous; the admin clicks "Sync from polyg.in" to refresh
     * status to approved / rejected once Meta has reviewed.
     */
    async pushWhatsappTemplateToPolygin(input: {
        slug: string
    }): Promise<
        | { ok: true; row: any; provider_response: any }
        | { ok: false; reason: string }
    > {
        const row = await this.getWhatsappTemplateBySlug(input.slug)
        if (!row) {
            return { ok: false, reason: `template "${input.slug}" not found` }
        }

        const cfg = await this.getPolyginConfigDecrypted()
        if (!cfg || !cfg.dashboard_token) {
            return {
                ok: false,
                reason:
                    "Polygin dashboard token missing. Open polyg.in in your browser, log in, then in DevTools console run `copy(localStorage.wacrm_user)` and paste the result into the 'Dashboard token' field on the WhatsApp settings tab.",
            }
        }

        // Bake brand placeholders BEFORE submitting — Meta approves the
        // exact wording it receives.
        const brand = await this.getBrandConfigView()
        const resolvedComponents = this.substituteBrandInComponents(
            row.components || [],
            brand,
        )

        // `parameter_format: "POSITIONAL"` is required by the recent
        // Meta API surface. Without it Meta defaults to NAMED format
        // and rejects our {{1}}/{{2}} bodies. All approved Polygin
        // templates we sampled carry this field — so do we now.
        const payload = {
            templateType: row.template_type || "STANDARD",
            name: row.name,
            language: row.language || "en",
            category: row.category,
            parameter_format: "POSITIONAL",
            components: resolvedComponents,
            token: cfg.token,
        }

        try {
            const res = await fetch(
                "https://polyg.in/api/user/add_meta_templet",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${cfg.dashboard_token}`,
                    },
                    body: JSON.stringify(payload),
                },
            )
            // Polygin's add_meta_templet response shape varies — different
            // deployments return {success:true}, {status:"success"}, just
            // a template id, or the raw Meta forward. Treat HTTP 2xx as
            // success unless the body explicitly says otherwise.
            const rawText = await res.text()
            let body: any = null
            try {
                body = rawText ? JSON.parse(rawText) : null
            } catch {
                body = { _raw: rawText }
            }
            const explicitFailure =
                (body && body.success === false) ||
                (body && typeof body.error === "string" && body.error.length > 0) ||
                (body && Array.isArray(body.errors) && body.errors.length > 0)
            const httpOk = res.status >= 200 && res.status < 300
            if (!httpOk || explicitFailure) {
                const reason =
                    body?.message ||
                    body?.error ||
                    (Array.isArray(body?.errors)
                        ? body.errors
                              .map((e: any) =>
                                  typeof e === "string"
                                      ? e
                                      : e?.message || JSON.stringify(e),
                              )
                              .join("; ")
                        : "") ||
                    `polygin HTTP ${res.status}`
                await (this as any).updateWhatsappTemplates({
                    id: row.id,
                    polygin_status: "rejected",
                    polygin_last_error: `${reason} (raw: ${(rawText || "").slice(0, 200)})`,
                    polygin_last_synced_at: new Date(),
                })
                return { ok: false, reason }
            }
            const providerId =
                body?.data?.id ||
                body?.template?.id ||
                body?.template_id ||
                body?.id ||
                null
            await (this as any).updateWhatsappTemplates({
                id: row.id,
                polygin_status: "pushed",
                polygin_template_id: providerId,
                polygin_pushed_at: new Date(),
                polygin_last_error: null,
                polygin_last_synced_at: new Date(),
            })
            return {
                ok: true,
                row: await this.getWhatsappTemplateBySlug(input.slug),
                provider_response: body ?? { _raw: rawText },
            }
        } catch (err: any) {
            const reason = err?.message || String(err)
            await (this as any).updateWhatsappTemplates({
                id: row.id,
                polygin_status: "rejected",
                polygin_last_error: reason,
                polygin_last_synced_at: new Date(),
            })
            return { ok: false, reason }
        }
    }

    /**
     * Sync local template statuses from polyg.in.
     *
     * GET https://polyg.in/api/user/get_my_meta_templets
     *
     * Polygin returns templates as Meta knows them (approved / pending
     * / rejected / paused). Match by `name`, update each local row's
     * `polygin_status`. Templates not yet pushed stay as "draft".
     * Authenticates with the dashboard JWT.
     *
     * NOTE: the `_beta` variant of this endpoint silently filters to
     * APPROVED-only — switching to the non-beta endpoint surfaces
     * REJECTED + PAUSED templates correctly.
     */
    async syncWhatsappTemplatesFromPolygin(): Promise<{
        ok: boolean
        updated: number
        reason?: string
    }> {
        const cfg = await this.getPolyginConfigDecrypted()
        if (!cfg || !cfg.dashboard_token) {
            return {
                ok: false,
                updated: 0,
                reason:
                    "Polygin dashboard token missing — cannot read template statuses without it.",
            }
        }
        try {
            const res = await fetch(
                "https://polyg.in/api/user/get_my_meta_templets",
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${cfg.dashboard_token}`,
                    },
                },
            )
            const body: any = await res.json().catch(() => null)
            if (!res.ok) {
                return {
                    ok: false,
                    updated: 0,
                    reason: `polygin HTTP ${res.status}`,
                }
            }
            const remoteList: any[] = Array.isArray(body)
                ? body
                : body?.templates ||
                  body?.data ||
                  body?.result ||
                  []
            const remoteByName = new Map<string, any>()
            for (const t of remoteList) {
                const n = (t?.name || t?.templetName || "").toLowerCase()
                if (n) remoteByName.set(n, t)
            }
            const localRows: any[] = await (this as any).listWhatsappTemplates(
                {},
                {},
            )
            let updated = 0
            for (const row of localRows) {
                const remote = remoteByName.get((row.name || "").toLowerCase())
                if (!remote) continue
                const remoteStatus = String(
                    remote.status || remote.template_status || "",
                ).toLowerCase()
                let next: string | null = null
                if (remoteStatus === "approved") next = "approved"
                else if (
                    remoteStatus === "rejected" ||
                    remoteStatus === "denied"
                )
                    next = "rejected"
                else if (remoteStatus === "paused" || remoteStatus === "flagged")
                    next = "paused"
                else if (
                    remoteStatus === "pending" ||
                    remoteStatus === "in_appeal" ||
                    remoteStatus === "submitted"
                )
                    next = "pushed"
                if (!next || next === row.polygin_status) continue
                await (this as any).updateWhatsappTemplates({
                    id: row.id,
                    polygin_status: next,
                    polygin_template_id:
                        remote.id || row.polygin_template_id || null,
                    polygin_last_error:
                        next === "rejected"
                            ? remote.rejection_reason || row.polygin_last_error
                            : null,
                    polygin_last_synced_at: new Date(),
                })
                updated++
            }
            return { ok: true, updated }
        } catch (err: any) {
            return {
                ok: false,
                updated: 0,
                reason: err?.message || String(err),
            }
        }
    }

    /**
     * Send a Meta-approved WhatsApp template via polyg.in.
     *
     * POST https://polyg.in/api/v1/send_templet
     *
     * Returns ok+message_id when delivery is accepted. Skips with a
     * "skipped" log row when the template isn't approved yet — callers
     * (e.g. sendPhoneMessage) treat that as a soft-fail and fall through
     * to free-text WhatsApp / SMS.
     */
    async sendWhatsappTemplate(input: {
        to: string
        slug: string
        variables: string[]
        media_uri?: string | null
        otp_request_id?: string | null
    }): Promise<
        | { ok: true; message_id: string | null }
        | { ok: false; reason: string }
    > {
        const row = await this.getWhatsappTemplateBySlug(input.slug)
        if (!row) {
            return {
                ok: false,
                reason: `template "${input.slug}" not found`,
            }
        }
        if (row.polygin_status !== "approved") {
            // Don't waste an HTTP round-trip if Meta hasn't approved it.
            return {
                ok: false,
                reason: `template not approved (status=${row.polygin_status})`,
            }
        }
        const cfg = await this.getPolyginConfigDecrypted()
        if (!cfg || !cfg.enabled || !cfg.token) {
            return {
                ok: false,
                reason: "Polygin not configured or disabled.",
            }
        }

        // Compute the rendered body so the WhatsappLog row has something
        // human-readable to display. Substitute brand placeholders too
        // so the log shows the actual delivered text.
        const brandForLog = await this.getBrandConfigView()
        const renderedBody = this.renderWhatsappTemplateBody(
            row,
            input.variables,
            brandForLog,
        )

        try {
            const res = await fetch(
                "https://polyg.in/api/v1/send_templet",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${cfg.token}`,
                    },
                    body: JSON.stringify({
                        sendTo: input.to,
                        templetName: row.name,
                        exampleArr: input.variables,
                        token: cfg.token,
                        ...(input.media_uri &&
                            /^https?:\/\//i.test(input.media_uri)
                            ? { mediaUri: input.media_uri }
                            : {}),
                        enableLog: true,
                    }),
                },
            )
            const body: any = await res
                .json()
                .catch(() => ({ success: false, message: "non-json body" }))
            if (!res.ok || body?.success === false) {
                const reason =
                    body?.message ||
                    body?.error ||
                    `polygin HTTP ${res.status}`
                await this.logWhatsapp({
                    to_phone: input.to,
                    body: renderedBody,
                    status: "failed",
                    error: reason,
                    otp_request_id: input.otp_request_id ?? null,
                    meta: {
                        template_slug: row.slug,
                        template_name: row.name,
                        http_status: res.status,
                        provider_response: body,
                    },
                })
                return { ok: false, reason }
            }
            const messageId =
                body?.metaResponse?.message_id ||
                body?.message_id ||
                body?.data?.messageId ||
                null
            await this.logWhatsapp({
                to_phone: input.to,
                body: renderedBody,
                status: "sent",
                provider_message_id: messageId,
                otp_request_id: input.otp_request_id ?? null,
                meta: {
                    template_slug: row.slug,
                    template_name: row.name,
                    http_status: res.status,
                    sent_via_template: true,
                },
            })
            return { ok: true, message_id: messageId }
        } catch (err: any) {
            const reason = err?.message || String(err)
            await this.logWhatsapp({
                to_phone: input.to,
                body: renderedBody,
                status: "failed",
                error: reason,
                otp_request_id: input.otp_request_id ?? null,
                meta: { template_slug: row.slug, template_name: row.name },
            })
            return { ok: false, reason }
        }
    }

    /* ============================================================== *
     * System-template refresh — re-apply the seed catalogs to the DB.
     *
     * The seed loader uses ON CONFLICT DO NOTHING so it never updates
     * an existing row; that's the right default for ops who manually
     * tweak templates in the admin UI. But when the brand surface is
     * widened (new placeholders, new tagline, etc.) we want a one-click
     * refresh so existing system rows pick up the canonical wording.
     *
     * Both refreshers:
     *   - INSERT new system templates that don't exist yet (slug-keyed).
     *   - UPDATE existing rows ONLY when `is_system = true`. Admin-
     *     created customs (is_system = false) are never touched.
     *   - For WhatsApp: also reset `polygin_status` to "draft" because
     *     wording changed → Meta-side approval is now stale.
     *   - Also re-INSERT default whatsapp event maps for any new events.
     * ============================================================== */
    async refreshSystemWhatsappTemplates(): Promise<{
        ok: boolean
        inserted: number
        updated: number
        skipped: string[]
    }> {
        let inserted = 0
        let updated = 0
        const skipped: string[] = []

        // Bot-button injection settings — read once per refresh.
        const brand = await this.getBrandConfigView()
        const botCategories = new Set(brand.whatsapp_bot_categories ?? [])

        for (const t of DEFAULT_WHATSAPP_TEMPLATES) {
            const components = applyBotButton(
                t.components as any[],
                t.category,
                botCategories,
            )
            const existing = await this.getWhatsappTemplateBySlug(t.slug)
            if (!existing) {
                await (this as any).createWhatsappTemplates({
                    slug: t.slug,
                    name: t.name,
                    label: t.label,
                    description: t.description,
                    category: t.category,
                    language: t.language,
                    template_type: "STANDARD",
                    components,
                    variables: t.variables,
                    is_system: true,
                    polygin_status: "draft",
                })
                inserted++
                continue
            }
            if (!existing.is_system) {
                skipped.push(t.slug)
                continue
            }
            await (this as any).updateWhatsappTemplates({
                id: existing.id,
                name: t.name,
                label: t.label,
                description: t.description,
                category: t.category,
                language: t.language,
                template_type: "STANDARD",
                components,
                variables: t.variables,
                is_system: true,
                // Wording changed → Meta-side approval is stale.
                polygin_status: "draft",
                polygin_template_id: null,
                polygin_last_error: null,
            })
            updated++
        }

        // Refresh event maps too — INSERT only, never overwrite admin
        // edits to the binding. New events (bank.*, demat.*, etc.) get
        // wired automatically.
        for (const m of DEFAULT_WHATSAPP_EVENT_MAPS) {
            const existing = await this.getWhatsappEventMapping(m.event_name)
            if (existing) continue
            await (this as any).createWhatsappEventMaps({
                event_name: m.event_name,
                template_slug: m.template_slug,
                to_resolver: m.to_resolver,
                static_to: m.static_to ?? null,
                enabled: m.enabled ?? true,
            })
        }

        return { ok: true, inserted, updated, skipped }
    }

    async refreshSystemSmsTemplates(): Promise<{
        ok: boolean
        inserted: number
        updated: number
        skipped: string[]
    }> {
        let inserted = 0
        let updated = 0
        const skipped: string[] = []

        for (const t of DEFAULT_SMS_TEMPLATES) {
            const existing = await this.getSmsTemplateBySlug(t.slug)
            const isOtp =
                t.slug.startsWith("auth.") &&
                t.slug.includes("otp")
            if (!existing) {
                await (this as any).createSmsTemplates({
                    slug: t.slug,
                    label: t.label,
                    description: t.description,
                    body: t.body,
                    variables: t.variables,
                    is_otp: isOtp,
                    is_system: true,
                    dlt_status: "draft",
                })
                inserted++
                continue
            }
            if (!existing.is_system) {
                skipped.push(t.slug)
                continue
            }
            await (this as any).updateSmsTemplates({
                id: existing.id,
                label: t.label,
                description: t.description,
                body: t.body,
                variables: t.variables,
                is_otp: isOtp,
                is_system: true,
            })
            updated++
        }

        return { ok: true, inserted, updated, skipped }
    }

    /* ============================================================== *
     * SMS templates — registry CRUD
     * ============================================================== */

    async listSmsTemplatesView(filters?: {
        is_otp?: boolean
        dlt_status?: string
    }): Promise<any[]> {
        const fq: any = {}
        if (typeof filters?.is_otp === "boolean") fq.is_otp = filters.is_otp
        if (filters?.dlt_status) fq.dlt_status = filters.dlt_status
        const rows: any[] = await (this as any).listSmsTemplates(
            Object.keys(fq).length ? fq : undefined,
            { order: { created_at: "ASC" } },
        )
        return rows
    }

    async getSmsTemplateBySlug(slug: string) {
        const rows: any[] = await (this as any).listSmsTemplates({ slug })
        return rows?.[0] ?? null
    }

    async upsertSmsTemplate(input: {
        slug: string
        label?: string | null
        description?: string | null
        body?: string
        variables?: any[] | null
        dlt_template_id?: string | null
        dlt_status?: "draft" | "pending" | "approved" | "rejected"
        is_otp?: boolean
        is_system?: boolean
    }): Promise<any> {
        const existing = await this.getSmsTemplateBySlug(input.slug)
        const merged: any = {
            slug: input.slug,
            label: input.label ?? existing?.label ?? null,
            description: input.description ?? existing?.description ?? null,
            body: input.body ?? existing?.body ?? "",
            variables: input.variables ?? existing?.variables ?? null,
            dlt_template_id:
                input.dlt_template_id ?? existing?.dlt_template_id ?? null,
            dlt_status: input.dlt_status ?? existing?.dlt_status ?? "draft",
            is_otp:
                typeof input.is_otp === "boolean"
                    ? input.is_otp
                    : existing?.is_otp ?? false,
            is_system:
                typeof input.is_system === "boolean"
                    ? input.is_system
                    : existing?.is_system ?? false,
        }
        if (existing) {
            merged.id = existing.id
            await (this as any).updateSmsTemplates(merged)
            return this.getSmsTemplateBySlug(input.slug)
        }
        await (this as any).createSmsTemplates(merged)
        return this.getSmsTemplateBySlug(input.slug)
    }

    /**
     * Render an SMS template's body — substitutes `{{brand}}` /
     * `{{storefront_url}}` first, then positional `{{N}}` variables.
     *
     * Sync because callers (createPhoneOtp / resendPhoneOtp) preload
     * the brand config once and pass it in. If `brand` is omitted,
     * reasonable defaults are filled in so the function still works
     * during tests / on a fresh install.
     */
    renderSmsTemplateBody(
        template: any,
        variables: string[],
        brand?: {
            brand_name?: string
            storefront_url?: string
            support_email?: string | null
        } | null,
    ): string {
        const text: string = template?.body ?? ""
        return this.resolveBrandAndPositional(text, brand ?? null, variables)
    }

    /* ============================================================== *
     * Brand config — {{brand}} placeholder source for templates
     * ============================================================== */

    private async loadBrandRow(): Promise<any | null> {
        const rows = await (this as any).listBrandConfigs(
            { id: SINGLETON_ID },
            {},
        )
        return rows?.[0] ?? null
    }

    async getBrandConfigView(): Promise<{
        brand_name: string
        company_name: string | null
        storefront_url: string
        support_email: string | null
        support_phone: string | null
        address: string | null
        tagline: string | null
        whatsapp_bot_label: string
        whatsapp_bot_categories: string[]
    }> {
        const row = await this.loadBrandRow()
        const cats = Array.isArray(row?.whatsapp_bot_categories)
            ? (row.whatsapp_bot_categories as string[]).filter(
                  (c): c is string => typeof c === "string",
              )
            : ["UTILITY", "MARKETING"]
        return {
            brand_name: row?.brand_name ?? "Risitex",
            company_name: row?.company_name ?? null,
            storefront_url: row?.storefront_url ?? "https://risitex.com",
            support_email: row?.support_email ?? null,
            support_phone: row?.support_phone ?? null,
            address: row?.address ?? null,
            tagline: row?.tagline ?? null,
            whatsapp_bot_label: row?.whatsapp_bot_label ?? "Initiate Bot",
            whatsapp_bot_categories: cats,
        }
    }

    async upsertBrandConfig(input: {
        brand_name?: string
        company_name?: string | null
        storefront_url?: string
        support_email?: string | null
        support_phone?: string | null
        address?: string | null
        tagline?: string | null
        whatsapp_bot_label?: string
        whatsapp_bot_categories?: string[]
    }): Promise<ReturnType<typeof this.getBrandConfigView>> {
        const existing = await this.loadBrandRow()
        const pickNullable = <T,>(
            input: T | null | undefined,
            existingValue: T | null | undefined,
        ): T | null =>
            input === undefined
                ? (existingValue ?? null)
                : (input ?? null)
        const merged: any = {
            id: SINGLETON_ID,
            brand_name:
                input.brand_name ?? existing?.brand_name ?? "Risitex",
            storefront_url:
                input.storefront_url ??
                existing?.storefront_url ??
                "https://risitex.com",
            company_name: pickNullable(input.company_name, existing?.company_name),
            support_email: pickNullable(
                input.support_email,
                existing?.support_email,
            ),
            support_phone: pickNullable(
                input.support_phone,
                existing?.support_phone,
            ),
            address: pickNullable(input.address, existing?.address),
            tagline: pickNullable(input.tagline, existing?.tagline),
            whatsapp_bot_label:
                (input.whatsapp_bot_label && input.whatsapp_bot_label.trim()) ||
                existing?.whatsapp_bot_label ||
                "Initiate Bot",
            whatsapp_bot_categories: Array.isArray(input.whatsapp_bot_categories)
                ? input.whatsapp_bot_categories.filter(
                      (c): c is string => typeof c === "string",
                  )
                : Array.isArray(existing?.whatsapp_bot_categories)
                  ? existing.whatsapp_bot_categories
                  : ["UTILITY", "MARKETING"],
        }
        if (existing) {
            await (this as any).updateBrandConfigs(merged)
        } else {
            await (this as any).createBrandConfigs(merged)
        }
        return this.getBrandConfigView()
    }

    /**
     * Recursively walk a Meta-template `components` array and substitute
     * EVERY brand placeholder ({{brand}}, {{company_name}},
     * {{storefront_url}}, {{support_email}}, {{support_phone}},
     * {{address}}, {{tagline}}) in TEXT fields — body, footer, header
     * text, button text/URLs. Used at PUSH time so Meta receives the
     * resolved wording.
     */
    private substituteBrandInComponents(
        components: any[],
        brand: {
            brand_name: string
            company_name?: string | null
            storefront_url: string
            support_email?: string | null
            support_phone?: string | null
            address?: string | null
            tagline?: string | null
        },
    ): any[] {
        const replacements = brandReplacementMap(brand)
        const apply = (s: string): string => {
            let out = s
            for (const [placeholder, value] of Object.entries(replacements)) {
                const re = new RegExp(
                    `\\{\\{\\s*${placeholder}\\s*\\}\\}`,
                    "g",
                )
                out = out.replace(re, value)
            }
            return out
        }
        return (components || []).map((c) => {
            const next = { ...c }
            if (typeof next.text === "string") next.text = apply(next.text)
            if (Array.isArray(next.buttons)) {
                next.buttons = next.buttons.map((b: any) => {
                    const nb = { ...b }
                    if (typeof nb.text === "string") nb.text = apply(nb.text)
                    if (typeof nb.url === "string") nb.url = apply(nb.url)
                    return nb
                })
            }
            // Header/footer follow the BODY pattern; example shapes are
            // not mutated (they're sample values for Meta's review, not
            // user-facing).
            return next
        })
    }

    /* ============================================================== *
     * WhatsApp event mappings — separate from email event mappings
     * ============================================================== */

    async getWhatsappEventMapping(event_name: string) {
        const rows = await (this as any).listWhatsappEventMaps({ event_name })
        return rows?.[0] ?? null
    }

    async listWhatsappEventMappingsView(): Promise<any[]> {
        const rows: any[] = await (this as any).listWhatsappEventMaps(
            {},
            { order: { event_name: "ASC" } },
        )
        return rows
    }

    async upsertWhatsappEventMapping(input: {
        event_name: string
        template_slug: string
        to_resolver?: "customer_phone" | "static"
        static_to?: string | null
        enabled?: boolean
    }) {
        const existing = await this.getWhatsappEventMapping(input.event_name)
        if (existing) {
            await (this as any).updateWhatsappEventMaps({
                id: existing.id,
                template_slug: input.template_slug,
                to_resolver: input.to_resolver ?? existing.to_resolver,
                static_to: input.static_to ?? existing.static_to,
                enabled:
                    typeof input.enabled === "boolean"
                        ? input.enabled
                        : existing.enabled,
            })
            return this.getWhatsappEventMapping(input.event_name)
        }
        await (this as any).createWhatsappEventMaps({
            event_name: input.event_name,
            template_slug: input.template_slug,
            to_resolver: input.to_resolver ?? "customer_phone",
            static_to: input.static_to ?? null,
            enabled:
                typeof input.enabled === "boolean" ? input.enabled : true,
        })
        return this.getWhatsappEventMapping(input.event_name)
    }

    /* ============================================================== *
     * Send-log writers
     * ============================================================== */

    async logSms(row: {
        to_phone: string
        body?: string | null
        status: "sent" | "failed" | "skipped"
        error?: string | null
        provider_message_id?: string | null
        otp_request_id?: string | null
        meta?: any
    }) {
        try {
            await (this as any).createSmsLogs({
                to_phone: row.to_phone,
                body: row.body ?? null,
                provider: "msg91",
                status: row.status,
                error: row.error ?? null,
                provider_message_id: row.provider_message_id ?? null,
                otp_request_id: row.otp_request_id ?? null,
                meta: row.meta ?? null,
            })
        } catch (err) {
            console.error(
                "[polemarch_communication] failed to write SmsLog:",
                err,
            )
        }
    }

    async logWhatsapp(row: {
        to_phone: string
        body?: string | null
        status: "sent" | "failed" | "skipped"
        error?: string | null
        provider_message_id?: string | null
        otp_request_id?: string | null
        meta?: any
    }) {
        try {
            await (this as any).createWhatsappLogs({
                to_phone: row.to_phone,
                body: row.body ?? null,
                provider: "polygin",
                status: row.status,
                error: row.error ?? null,
                provider_message_id: row.provider_message_id ?? null,
                otp_request_id: row.otp_request_id ?? null,
                meta: row.meta ?? null,
            })
        } catch (err) {
            console.error(
                "[polemarch_communication] failed to write WhatsappLog:",
                err,
            )
        }
    }

    /* ============================================================== *
     * Phone OTP — create + verify
     * ============================================================== */

    /**
     * Hash an OTP with a per-row salt + a server-side pepper.
     *
     * Pepper comes from `OTP_PEPPER` (preferred) or falls back to
     * `JWT_SECRET` so a fresh install without OTP_PEPPER set still has
     * *some* peppering — the server's other secrets are equally
     * sensitive and already required to be set.
     */
    private hashOtp(salt: string, otp: string): string {
        const pepper =
            process.env.OTP_PEPPER ||
            process.env.JWT_SECRET ||
            process.env.COOKIE_SECRET ||
            ""
        return createHash("sha256")
            .update(`${pepper}:${salt}:${otp}`)
            .digest("hex")
    }

    /**
     * Create a phone OTP and dispatch it via WhatsApp → SMS fallback.
     *
     * `purpose=login`  — phone is anonymous; customer_id resolved at
     *                    verify time by phone lookup.
     * `purpose=verify` — caller is already authenticated; pass
     *                    customerId so the verify step can compare.
     */
    async createPhoneOtp(input: {
        phone_e164: string
        purpose: "login" | "verify"
        customer_id?: string | null
        ip_hash?: string | null
        ttl_ms?: number
    }): Promise<{
        otp_request_id: string
        expires_at: Date
        sent_via: "whatsapp" | "sms" | "failed"
        masked_phone: string
    }> {
        try {
            const ttl_ms = input.ttl_ms ?? 10 * 60 * 1000 // 10 minutes
            const otp = String(randomInt(0, 1_000_000)).padStart(6, "0")
            const salt = randomBytes(16).toString("hex")
            const otp_hash = this.hashOtp(salt, otp)
            const expires_at = new Date(Date.now() + ttl_ms)

            const created: any = await (this as any).createOtpRequests({
                phone_e164: input.phone_e164,
                purpose: input.purpose,
                customer_id: input.customer_id ?? null,
            otp_hash,
            salt,
            attempts: 0,
            max_attempts: 5,
            expires_at,
            consumed_at: null,
            sent_via: null,
            provider_message_id: null,
            ip_hash: input.ip_hash ?? null,
        })
        const otp_request_id: string = created?.id ?? created?.[0]?.id

        // Compose three template / body sources, in order of preference:
        //   1. Meta WhatsApp template — picked by purpose-specific slug.
        //      The rendered body is also used as the human-readable text
        //      for the WhatsApp log + as the free-form fallback if the
        //      template path bails.
        //   2. Free-form WhatsApp body (if no template approved yet).
        //   3. SMS body — uses the SMS template if registered with a
        //      DLT id, else falls back to the Msg91Config defaults.
        const templateSlug =
            input.purpose === "verify"
                ? "auth.phone_verify_otp"
                : "auth.phone_otp_login"
        // Load the brand config once and reuse for both WA + SMS rendering.
        const brand = await this.getBrandConfigView()
        const waTemplate = await this.getWhatsappTemplateBySlug(templateSlug)
        const renderedFromTemplate = waTemplate
            ? this.renderWhatsappTemplateBody(waTemplate, [otp], brand)
            : null
        const text =
            renderedFromTemplate ||
            `Your ${brand.brand_name} OTP is ${otp}. Valid for 10 minutes. Do not share this code with anyone.`

        // SMS DLT id resolution: prefer the per-template row's DLT id
        // (if registered with TRAI + approved), else the Msg91Config
        // default OTP template, else the generic SMS template.
        const smsTemplate = await this.getSmsTemplateBySlug(templateSlug)
        const msg91 = await this.getMsg91ConfigDecrypted()
        const dlt_template_id =
            (smsTemplate?.dlt_status === "approved"
                ? smsTemplate?.dlt_template_id
                : null) ||
            msg91?.otp_template_id ||
            msg91?.sms_template_id ||
            null
        const smsBody = smsTemplate
            ? this.renderSmsTemplateBody(smsTemplate, [otp], brand)
            : text

        const send = await this.sendPhoneMessage({
            to: input.phone_e164,
            text: smsBody,
            template_slug: templateSlug,
            template_variables: [otp],
            dlt_template_id,
            otp_request_id,
        })

        // Stamp the row with the channel that succeeded so the verify
        // step + admin log viewer know how the OTP got delivered.
        const provider_message_id = [
            send.whatsapp_template_result?.ok
                ? send.whatsapp_template_result.message_id
                : null,
            send.whatsapp_result?.ok ? send.whatsapp_result.message_id : null,
            send.sms_result?.ok ? send.sms_result.message_id : null,
        ]
            .filter(Boolean)
            .join(",")
        // The OtpRequest row's `sent_via` enum doesn't carry a
        // whatsapp_template option (we don't want to schema-bump for
        // every new sub-channel) — collapse it back to "whatsapp" since
        // from the UX perspective the user just got a WhatsApp message.
        const stampedSentVia: "whatsapp" | "sms" | "failed" =
            send.sent_via === "whatsapp_template"
                ? "whatsapp"
                : send.sent_via

        // Dev-mode demo fallback: when BOTH WhatsApp and SMS bombed
        // (typically because Polygin + MSG91 aren't configured) AND
        // we're not in production, rewrite the row with the fixed
        // demo OTP so the storefront verify flow can complete. Same
        // pattern as the email-OTP fallback.
        const devFallback =
            stampedSentVia === "failed" &&
            process.env.NODE_ENV !== "production"
        if (devFallback) {
            const demoOtp = process.env.DEV_DEMO_OTP || "123456"
            const demoSalt = randomBytes(16).toString("hex")
            const demoHash = this.hashOtp(demoSalt, demoOtp)
            await (this as any).updateOtpRequests({
                id: otp_request_id,
                otp_hash: demoHash,
                salt: demoSalt,
                sent_via: "whatsapp",
                provider_message_id: "dev-demo-code",
            })
            // eslint-disable-next-line no-console
            console.warn(
                `[phone-otp] [DEV] WhatsApp + SMS not configured — use demo code ${demoOtp} ` +
                    `for ${input.phone_e164}. Configure Polygin + MSG91 in admin → ` +
                    `Communication → WhatsApp / SMS settings to ship real codes.`,
            )
            return {
                otp_request_id,
                expires_at,
                sent_via: "whatsapp",
                masked_phone: maskPhone(input.phone_e164),
            }
        }

        await (this as any).updateOtpRequests({
            id: otp_request_id,
            sent_via: stampedSentVia,
            provider_message_id: provider_message_id || null,
        })

        return {
            otp_request_id,
            expires_at,
            sent_via: stampedSentVia,
            masked_phone: maskPhone(input.phone_e164),
        }
        } catch (err: any) {
            console.error("[phone-otp] createPhoneOtp failed:", err)
            return {
                otp_request_id: "",
                expires_at: new Date(0),
                sent_via: "failed" as const,
                masked_phone: maskPhone(input.phone_e164),
            }
        }
    }

    /**
     * Verify a phone OTP. On success, returns `{ok: true, customer_id}`.
     *
     * `customer_id` is resolved by the caller for `purpose=login` flows
     * (the route looks up the customer by phone after this method
     * confirms the OTP); for `purpose=verify` it's whatever was stamped
     * on the row at creation time.
     */
    async verifyPhoneOtp(input: {
        otp_request_id: string
        phone_e164: string
        otp: string
    }): Promise<
        | {
              ok: true
              purpose: "login" | "verify"
              customer_id: string | null
              phone_e164: string
          }
        | { ok: false; reason: string; remaining_attempts?: number }
    > {
        const rows = await (this as any).listOtpRequests(
            { id: input.otp_request_id },
            {},
        )
        const row = rows?.[0]
        if (!row) return { ok: false, reason: "OTP request not found" }
        if (row.phone_e164 !== input.phone_e164) {
            return { ok: false, reason: "Phone mismatch" }
        }
        if (row.consumed_at) {
            return { ok: false, reason: "OTP already used" }
        }
        if (new Date(row.expires_at).getTime() < Date.now()) {
            return { ok: false, reason: "OTP expired" }
        }
        if ((row.attempts ?? 0) >= (row.max_attempts ?? 5)) {
            return {
                ok: false,
                reason: "Too many attempts. Request a new OTP.",
            }
        }

        const candidate = this.hashOtp(row.salt, input.otp)
        if (candidate !== row.otp_hash) {
            const nextAttempts = (row.attempts ?? 0) + 1
            await (this as any).updateOtpRequests({
                id: row.id,
                attempts: nextAttempts,
            })
            return {
                ok: false,
                reason: "Incorrect OTP",
                remaining_attempts: Math.max(
                    0,
                    (row.max_attempts ?? 5) - nextAttempts,
                ),
            }
        }

        await (this as any).updateOtpRequests({
            id: row.id,
            consumed_at: new Date(),
            attempts: (row.attempts ?? 0) + 1,
        })

        return {
            ok: true,
            purpose: row.purpose,
            customer_id: row.customer_id ?? null,
            phone_e164: row.phone_e164,
        }
    }

    /**
     * Re-send the OTP for an existing request. Same row, new dispatch —
     * useful when WhatsApp and SMS both failed the first time and the
     * user clicks "Resend code". Bumps a soft attempt counter so a
     * misbehaving client can't drain provider quota; the user-facing
     * resend handler should additionally rate-limit by IP.
     */
    async resendPhoneOtp(input: { otp_request_id: string }): Promise<{
        ok: boolean
        sent_via: "whatsapp_template" | "whatsapp" | "sms" | "failed"
        masked_phone: string
        expires_at: Date
        reason?: string
    }> {
        const rows = await (this as any).listOtpRequests(
            { id: input.otp_request_id },
            {},
        )
        const row = rows?.[0]
        if (!row) {
            return {
                ok: false,
                sent_via: "failed",
                masked_phone: "",
                expires_at: new Date(0),
                reason: "OTP request not found",
            }
        }
        if (row.consumed_at) {
            return {
                ok: false,
                sent_via: "failed",
                masked_phone: maskPhone(row.phone_e164),
                expires_at: new Date(row.expires_at),
                reason: "OTP already used. Start a new login.",
            }
        }
        if (new Date(row.expires_at).getTime() < Date.now()) {
            return {
                ok: false,
                sent_via: "failed",
                masked_phone: maskPhone(row.phone_e164),
                expires_at: new Date(row.expires_at),
                reason: "OTP expired. Start a new login.",
            }
        }

        // We don't know the original plaintext (it's hashed). Generate
        // a fresh OTP, persist a new salt+hash, and dispatch.
        const otp = String(randomInt(0, 1_000_000)).padStart(6, "0")
        const salt = randomBytes(16).toString("hex")
        const otp_hash = this.hashOtp(salt, otp)

        // Same template-aware composition as createPhoneOtp — this keeps
        // the resend channel ordering identical to the first attempt.
        const templateSlug =
            row.purpose === "verify"
                ? "auth.phone_verify_otp"
                : "auth.phone_otp_login"
        const brand = await this.getBrandConfigView()
        const waTemplate = await this.getWhatsappTemplateBySlug(templateSlug)
        const renderedFromTemplate = waTemplate
            ? this.renderWhatsappTemplateBody(waTemplate, [otp], brand)
            : null
        const text =
            renderedFromTemplate ||
            `Your ${brand.brand_name} OTP is ${otp}. Valid for 10 minutes. Do not share this code with anyone.`

        const smsTemplate = await this.getSmsTemplateBySlug(templateSlug)
        const msg91 = await this.getMsg91ConfigDecrypted()
        const dlt_template_id =
            (smsTemplate?.dlt_status === "approved"
                ? smsTemplate?.dlt_template_id
                : null) ||
            msg91?.otp_template_id ||
            msg91?.sms_template_id ||
            null
        const smsBody = smsTemplate
            ? this.renderSmsTemplateBody(smsTemplate, [otp], brand)
            : text

        const send = await this.sendPhoneMessage({
            to: row.phone_e164,
            text: smsBody,
            template_slug: templateSlug,
            template_variables: [otp],
            dlt_template_id,
            otp_request_id: row.id,
        })

        const provider_message_id = [
            send.whatsapp_template_result?.ok
                ? send.whatsapp_template_result.message_id
                : null,
            send.whatsapp_result?.ok ? send.whatsapp_result.message_id : null,
            send.sms_result?.ok ? send.sms_result.message_id : null,
        ]
            .filter(Boolean)
            .join(",")
        // Same enum-collapse rule as createPhoneOtp (the OtpRequest row
        // schema doesn't track template_send as a separate channel).
        const stampedSentVia: "whatsapp" | "sms" | "failed" =
            send.sent_via === "whatsapp_template"
                ? "whatsapp"
                : send.sent_via
        await (this as any).updateOtpRequests({
            id: row.id,
            otp_hash,
            salt,
            // Reset attempts on a successful re-send so the user gets
            // a fresh 5-attempt budget; on a failed re-send don't
            // reset because we're already in a degraded state.
            attempts: send.ok ? 0 : row.attempts ?? 0,
            sent_via: stampedSentVia,
            provider_message_id: provider_message_id || null,
        })

        return {
            ok: send.ok,
            sent_via: send.sent_via,
            masked_phone: maskPhone(row.phone_e164),
            expires_at: new Date(row.expires_at),
            reason: send.ok ? undefined : "All channels failed",
        }
    }

    // ────────────────────────────────────────────────────────────────
    // Email OTP (Phase A — RISITEX mandatory email verification)
    // ────────────────────────────────────────────────────────────────

    /**
     * Create an email OTP and dispatch it via the configured SMTP
     * transport. Mirrors createPhoneOtp's shape so the storefront
     * verification UI can treat the two channels symmetrically.
     *
     * `purpose=verify` is the only supported flow — there is no
     * email-OTP login (email + password is the canonical login path).
     */
    async createEmailOtp(input: {
        email: string
        purpose: "verify"
        customer_id?: string | null
        ip_hash?: string | null
        ttl_ms?: number
    }): Promise<{
        otp_request_id: string
        expires_at: Date
        sent_via: "email" | "failed"
        masked_email: string
    }> {
        const ttl_ms = input.ttl_ms ?? 10 * 60 * 1000 // 10 minutes
        const otp = String(randomInt(0, 1_000_000)).padStart(6, "0")
        const salt = randomBytes(16).toString("hex")
        const otp_hash = this.hashOtp(salt, otp)
        const expires_at = new Date(Date.now() + ttl_ms)

        const created: any = await (this as any).createOtpRequests({
            channel: "email",
            phone_e164: null,
            email: input.email,
            purpose: input.purpose,
            customer_id: input.customer_id ?? null,
            otp_hash,
            salt,
            attempts: 0,
            max_attempts: 5,
            expires_at,
            consumed_at: null,
            sent_via: null,
            provider_message_id: null,
            ip_hash: input.ip_hash ?? null,
        })
        const otp_request_id: string = created?.id ?? created?.[0]?.id

        // Dispatch via the existing email pipeline — same template
        // catalog the rest of the lifecycle emails use. `auth.email_otp`
        // template is seeded with an {{otp}} variable + 10-minute
        // expiry copy.
        const send = await this.sendEmail({
            to: input.email,
            template_slug: "auth.email_otp",
            data: {
                otp,
                expires_in: "10 minutes",
                customer: {
                    email: input.email,
                },
            },
        })

        // Dev-mode fallback: when SMTP isn't configured OR the email
        // template hasn't been seeded, REPLACE the random OTP with a
        // fixed demo code (`DEV_DEMO_OTP` env var, default "123456")
        // so the developer can finish the verify flow without
        // checking logs for a different code each time. We then
        // re-hash + update the row with the demo code's hash so
        // verify-time comparison succeeds. Production stays strict —
        // gated on `NODE_ENV !== "production"`.
        const sendReason = (send as { reason?: string }).reason ?? ""
        const isDevTransportMiss =
            !send.ok &&
            (/smtp not configured/i.test(sendReason) ||
                /template ".*" not found/i.test(sendReason))
        const devFallback =
            isDevTransportMiss && process.env.NODE_ENV !== "production"

        let finalOtp = otp
        if (devFallback) {
            finalOtp = process.env.DEV_DEMO_OTP || "123456"
            const newSalt = randomBytes(16).toString("hex")
            const newHash = this.hashOtp(newSalt, finalOtp)
            await (this as any).updateOtpRequests({
                id: otp_request_id,
                otp_hash: newHash,
                salt: newSalt,
                sent_via: "email",
                provider_message_id: "dev-demo-code",
            })
            // eslint-disable-next-line no-console
            console.warn(
                `[email-otp] [DEV] SMTP/template not ready — use demo code ${finalOtp} ` +
                    `for ${input.email}. Configure SMTP in admin → Communication → Email ` +
                    `settings to ship real codes.`,
            )
        } else {
            const stampedSentVia: "email" | "failed" = send.ok ? "email" : "failed"
            const providerMessageId = send.ok && "message_id" in send
                ? (send as { message_id?: string }).message_id ?? null
                : null
            await (this as any).updateOtpRequests({
                id: otp_request_id,
                sent_via: stampedSentVia,
                provider_message_id: providerMessageId,
            })
        }

        return {
            otp_request_id,
            expires_at,
            sent_via: send.ok || devFallback ? "email" : "failed",
            masked_email: maskEmail(input.email),
        }
    }

    /**
     * Verify an email OTP. On success, returns `{ok: true, customer_id}`.
     *
     * Mirrors verifyPhoneOtp — same constant-time-ish comparison via the
     * peppered hash, same attempts counter, same expiry / consumed
     * shortcuts.
     */
    async verifyEmailOtp(input: {
        otp_request_id: string
        email: string
        otp: string
    }): Promise<
        | {
              ok: true
              purpose: "verify"
              customer_id: string | null
              email: string
          }
        | { ok: false; reason: string; remaining_attempts?: number }
    > {
        const rows = await (this as any).listOtpRequests(
            { id: input.otp_request_id },
            {},
        )
        const row = rows?.[0]
        if (!row) return { ok: false, reason: "OTP request not found" }
        if (row.channel !== "email") {
            return { ok: false, reason: "Wrong channel" }
        }
        if (row.email !== input.email) {
            return { ok: false, reason: "Email mismatch" }
        }
        if (row.consumed_at) {
            return { ok: false, reason: "OTP already used" }
        }
        if (new Date(row.expires_at).getTime() < Date.now()) {
            return { ok: false, reason: "OTP expired" }
        }
        if ((row.attempts ?? 0) >= (row.max_attempts ?? 5)) {
            return {
                ok: false,
                reason: "Too many attempts. Request a new OTP.",
            }
        }

        const candidate = this.hashOtp(row.salt, input.otp)
        if (candidate !== row.otp_hash) {
            const nextAttempts = (row.attempts ?? 0) + 1
            await (this as any).updateOtpRequests({
                id: row.id,
                attempts: nextAttempts,
            })
            return {
                ok: false,
                reason: "Incorrect OTP",
                remaining_attempts: Math.max(
                    0,
                    (row.max_attempts ?? 5) - nextAttempts,
                ),
            }
        }

        await (this as any).updateOtpRequests({
            id: row.id,
            consumed_at: new Date(),
            attempts: (row.attempts ?? 0) + 1,
        })

        return {
            ok: true,
            purpose: "verify",
            customer_id: row.customer_id ?? null,
            email: row.email,
        }
    }

    /**
     * Re-send the OTP for an existing email request. Generates a fresh
     * code + salt, persists, dispatches. Resets the attempts counter on
     * a successful re-send so the user gets a fresh 5-attempt budget.
     */
    async resendEmailOtp(input: { otp_request_id: string }): Promise<{
        ok: boolean
        sent_via: "email" | "failed"
        masked_email: string
        expires_at: Date
        reason?: string
    }> {
        const rows = await (this as any).listOtpRequests(
            { id: input.otp_request_id },
            {},
        )
        const row = rows?.[0]
        if (!row) {
            return {
                ok: false,
                sent_via: "failed",
                masked_email: "",
                expires_at: new Date(0),
                reason: "OTP request not found",
            }
        }
        if (row.channel !== "email") {
            return {
                ok: false,
                sent_via: "failed",
                masked_email: "",
                expires_at: new Date(row.expires_at),
                reason: "Wrong channel",
            }
        }
        if (row.consumed_at) {
            return {
                ok: false,
                sent_via: "failed",
                masked_email: maskEmail(row.email),
                expires_at: new Date(row.expires_at),
                reason: "OTP already used. Start a new verification.",
            }
        }
        if (new Date(row.expires_at).getTime() < Date.now()) {
            return {
                ok: false,
                sent_via: "failed",
                masked_email: maskEmail(row.email),
                expires_at: new Date(row.expires_at),
                reason: "OTP expired. Start a new verification.",
            }
        }

        const otp = String(randomInt(0, 1_000_000)).padStart(6, "0")
        const salt = randomBytes(16).toString("hex")
        const otp_hash = this.hashOtp(salt, otp)

        const send = await this.sendEmail({
            to: row.email,
            template_slug: "auth.email_otp",
            data: {
                otp,
                expires_in: "10 minutes",
                customer: { email: row.email },
            },
        })

        // Same dev fallback as createEmailOtp — replace the random
        // OTP with the demo code (DEV_DEMO_OTP env or "123456").
        const sendReason = (send as { reason?: string }).reason ?? ""
        const isDevTransportMiss =
            !send.ok &&
            (/smtp not configured/i.test(sendReason) ||
                /template ".*" not found/i.test(sendReason))
        const devFallback =
            isDevTransportMiss && process.env.NODE_ENV !== "production"

        let effectiveOk = send.ok || devFallback
        let storedHash = otp_hash
        let storedSalt = salt
        let storedSentVia: "email" | "failed" = effectiveOk ? "email" : "failed"
        let storedProviderId: string | null =
            send.ok && "message_id" in send
                ? (send as { message_id?: string }).message_id ?? null
                : null

        if (devFallback) {
            const demoOtp = process.env.DEV_DEMO_OTP || "123456"
            storedSalt = randomBytes(16).toString("hex")
            storedHash = this.hashOtp(storedSalt, demoOtp)
            storedSentVia = "email"
            storedProviderId = "dev-demo-code"
            // eslint-disable-next-line no-console
            console.warn(
                `[email-otp] [DEV] Resend — use demo code ${demoOtp} for ${row.email}.`,
            )
        }

        await (this as any).updateOtpRequests({
            id: row.id,
            otp_hash: storedHash,
            salt: storedSalt,
            attempts: effectiveOk ? 0 : row.attempts ?? 0,
            sent_via: storedSentVia,
            provider_message_id: storedProviderId,
        })

        return {
            ok: effectiveOk,
            sent_via: storedSentVia,
            masked_email: maskEmail(row.email),
            expires_at: new Date(row.expires_at),
            reason: effectiveOk ? undefined : "Email send failed",
        }
    }
}

/**
 * Return a phone number with most digits replaced by `*` for safe
 * display in UI / API responses. Keeps country code + last 2 digits.
 *   "+919876543210" → "+91********10"
 */
function maskPhone(phone_e164: string): string {
    if (!phone_e164) return ""
    const digits = phone_e164.replace(/\D/g, "")
    if (digits.length <= 4) return phone_e164
    const last2 = digits.slice(-2)
    const cc = phone_e164.startsWith("+")
        ? phone_e164.slice(0, Math.min(3, phone_e164.length - last2.length))
        : ""
    const middleLen = Math.max(0, digits.length - cc.replace(/\D/g, "").length - 2)
    return `${cc}${"*".repeat(middleLen)}${last2}`
}

/**
 * Mask an email address for safe display in UI / API responses.
 *   "manoj@mith.tech" → "m****j@mith.tech"
 *   "ab@x.io"         → "a*@x.io"
 * Keeps the domain visible so the user can confirm they're checking
 * the right inbox.
 */
function maskEmail(email: string | null | undefined): string {
    if (!email || typeof email !== "string") return ""
    const at = email.indexOf("@")
    if (at <= 0) return email
    const local = email.slice(0, at)
    const domain = email.slice(at)
    if (local.length <= 2) return `${local[0]}*${domain}`
    return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}${domain}`
}

export default CommunicationModuleService

/** Back-compat alias — kept so callers that imported `EmailModuleService`
 *  by type continue to compile. The class is the same; only the name
 *  has broadened in scope. */
export { CommunicationModuleService as EmailModuleService }
