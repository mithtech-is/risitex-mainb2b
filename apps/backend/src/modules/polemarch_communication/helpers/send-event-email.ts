import { Modules } from "@medusajs/framework/utils"
import { POLEMARCH_EMAIL_MODULE, EmailModuleService } from ".."
import type { SendEmailResult } from "../service"

/**
 * Fire a transactional notification for a named event across every
 * configured channel.
 *
 * Today this means:
 *   1. **Email** — looked up via `EventTemplateMap`, dispatched through
 *      our SMTP module. Always attempted when a mapping exists.
 *   2. **WhatsApp / SMS fallback** — looked up via `WhatsappEventMap`.
 *      When a mapping exists AND the customer has a usable phone, we
 *      call `sendPhoneMessage` which tries the Meta-approved template
 *      first, then free-text WhatsApp, then MSG91 SMS as a last resort.
 *
 * Either channel can fail or be skipped without breaking the other —
 * the function is best-effort and never throws. The two channels are
 * dispatched in parallel.
 *
 * Variable resolution for the WhatsApp/SMS path: each WhatsApp template
 * declares its positional variables in its `variables` array (in
 * order). For each variable, we look up `data[key]`, then
 * `data.customer?.[key]`, falling back to `""`. If any *required*
 * variable resolves to empty we skip the WA/SMS send (rather than
 * deliver a broken message). This convention lines up cleanly with the
 * Handlebars context the email side already uses, so existing call
 * sites get WA/SMS coverage for free.
 *
 * Contract: never throws. Problems are swallowed + logged.
 *
 * The historical name `sendEventEmail` is kept as an alias for
 * backwards compatibility with the 16 existing call sites — but the
 * implementation now covers all channels.
 */
export type SendEventEmailOverrides = {
    to?: string | null
    /**
     * Phone-channel override — bypasses customer-phone resolution.
     * Useful for OTP-style flows where the recipient is known before
     * the customer row exists. Pre-pend "+" + country code.
     */
    to_phone?: string | null
    /**
     * When set, the function won't re-fetch the customer row — it'll
     * trust the caller's `customer.*` values verbatim. Handy when you
     * already have the full customer object on hand.
     */
    skipCustomerLookup?: boolean
    /** Skip the WhatsApp/SMS fan-out entirely (e.g. when the caller
     *  has already triggered phone delivery directly). */
    skipPhone?: boolean
    /** Skip the email send (e.g. when the caller wants WA/SMS only). */
    skipEmail?: boolean
}

export type SendEventEmailResult =
    | { ok: true }
    | { ok: false; skipped_reason: string }

export async function sendEventNotification(
    scope: any,
    event_name: string,
    data: Record<string, any> = {},
    overrides: SendEventEmailOverrides = {},
): Promise<SendEventEmailResult> {
    const tasks: Promise<void>[] = []
    let emailOk = false
    let phoneOk = false
    let lastEmailReason: string | null = null
    let lastPhoneReason: string | null = null

    if (!overrides.skipEmail) {
        tasks.push(
            (async () => {
                const r = await dispatchEmail(scope, event_name, data, overrides)
                if (r.ok) emailOk = true
                else lastEmailReason = (r as { skipped_reason: string }).skipped_reason
            })(),
        )
    }
    if (!overrides.skipPhone) {
        tasks.push(
            (async () => {
                const r = await dispatchPhone(scope, event_name, data, overrides)
                if (r.ok) phoneOk = true
                else lastPhoneReason = (r as { skipped_reason: string }).skipped_reason
            })(),
        )
    }

    await Promise.all(tasks)

    if (emailOk || phoneOk) return { ok: true }
    return {
        ok: false,
        skipped_reason: [lastEmailReason, lastPhoneReason]
            .filter((s): s is string => !!s)
            .join("; ") || "no channel fired",
    }
}

/** Backwards-compatible alias. New code should use sendEventNotification. */
export const sendEventEmail = sendEventNotification

/* ───────────────────────── Email path ──────────────────────────── */
async function dispatchEmail(
    scope: any,
    event_name: string,
    data: Record<string, any>,
    overrides: SendEventEmailOverrides,
): Promise<SendEventEmailResult> {
    try {
        let emailModule: EmailModuleService
        try {
            emailModule = scope.resolve(POLEMARCH_EMAIL_MODULE)
        } catch {
            return {
                ok: false,
                skipped_reason: "polemarch_email module unavailable",
            }
        }

        const mapping = await emailModule.getEventMapping(event_name)
        if (!mapping) {
            return { ok: false, skipped_reason: `no email mapping for "${event_name}"` }
        }
        if (mapping.enabled === false) {
            return { ok: false, skipped_reason: `email mapping "${event_name}" disabled` }
        }

        let to: string | null = overrides.to ?? null
        if (!to) {
            if (mapping.to_resolver === "static") {
                to = mapping.static_to || null
            } else if (mapping.to_resolver === "admin_email") {
                to = process.env.ADMIN_NOTIFICATION_EMAIL || null
                if (!to) {
                    const cfg = await emailModule.getSmtpConfigView()
                    to = cfg.from_email || null
                }
            } else {
                // "customer_email"
                const customerId: string | undefined = data?.customer_id
                if (customerId && !overrides.skipCustomerLookup) {
                    try {
                        const customerModule: any = scope.resolve(Modules.CUSTOMER)
                        const rows = await customerModule.listCustomers(
                            { id: customerId },
                            { take: 1, select: ["id", "email", "first_name", "last_name", "phone"] },
                        )
                        const customer = rows?.[0]
                        if (customer?.email) {
                            to = customer.email
                            if (!data.customer) data.customer = customer
                            else data.customer = { ...customer, ...data.customer }
                        }
                    } catch {
                        /* customer module may not be resolvable here */
                    }
                }
                if (!to && data?.customer?.email) to = data.customer.email
            }
        }

        if (!to) {
            return {
                ok: false,
                skipped_reason: `couldn't resolve email recipient for "${event_name}"`,
            }
        }

        const storefront = process.env.STOREFRONT_URL || "https://risitex.com"
        if (!data.dashboard_url) data.dashboard_url = `${storefront}/dashboard`
        if (!data.support_url) data.support_url = `${storefront}/help`

        const result = (await emailModule.sendEmail({
            to,
            template_slug: mapping.template_slug,
            data,
        })) as SendEmailResult
        if (!result.ok) {
            const reason = "reason" in result ? result.reason : "unknown error"
            return { ok: false, skipped_reason: `email: ${reason}` }
        }
        return { ok: true }
    } catch (err: any) {
        console.warn(
            `[polemarch_email] dispatchEmail("${event_name}") failed: ${err?.message ?? err}`,
        )
        return {
            ok: false,
            skipped_reason: `email error: ${err?.message ?? "unknown"}`,
        }
    }
}

/* ──────────────────────── Phone path ───────────────────────────── */
async function dispatchPhone(
    scope: any,
    event_name: string,
    data: Record<string, any>,
    overrides: SendEventEmailOverrides,
): Promise<SendEventEmailResult> {
    try {
        let mod: any
        try {
            mod = scope.resolve(POLEMARCH_EMAIL_MODULE)
        } catch {
            return {
                ok: false,
                skipped_reason: "polemarch_communication module unavailable",
            }
        }

        const mapping = await mod
            .getWhatsappEventMapping(event_name)
            .catch(() => null)
        if (!mapping) {
            return {
                ok: false,
                skipped_reason: `no whatsapp mapping for "${event_name}"`,
            }
        }
        if (mapping.enabled === false) {
            return {
                ok: false,
                skipped_reason: `whatsapp mapping "${event_name}" disabled`,
            }
        }

        // Resolve recipient phone
        let to: string | null = overrides.to_phone ?? null
        if (!to) {
            if (mapping.to_resolver === "static") {
                to = mapping.static_to || null
            } else {
                // "customer_phone"
                const customerId: string | undefined = data?.customer_id
                if (customerId && !overrides.skipCustomerLookup) {
                    try {
                        const customerModule: any = scope.resolve(Modules.CUSTOMER)
                        const rows = await customerModule.listCustomers(
                            { id: customerId },
                            { take: 1, select: ["id", "phone", "first_name", "last_name", "email"] },
                        )
                        const customer = rows?.[0]
                        if (customer?.phone) {
                            to = customer.phone
                            if (!data.customer) data.customer = customer
                            else data.customer = { ...customer, ...data.customer }
                        }
                    } catch {
                        /* fall through */
                    }
                }
                if (!to && data?.customer?.phone) to = data.customer.phone
            }
        }

        if (!to) {
            return {
                ok: false,
                skipped_reason: `couldn't resolve phone recipient for "${event_name}"`,
            }
        }

        // Fetch the WhatsApp template to determine the positional
        // variable order, then resolve each from the data context.
        const tpl = await mod
            .getWhatsappTemplateBySlug(mapping.template_slug)
            .catch(() => null)
        if (!tpl) {
            return {
                ok: false,
                skipped_reason: `whatsapp template "${mapping.template_slug}" not found`,
            }
        }
        const variableMeta = Array.isArray(tpl.variables)
            ? (tpl.variables as Array<{
                  key: string
                  required?: boolean
              }>)
            : []
        const resolved: string[] = []
        for (const v of variableMeta) {
            const direct = data?.[v.key]
            const fromCustomer = data?.customer?.[v.key]
            const value =
                (typeof direct === "string" || typeof direct === "number"
                    ? String(direct)
                    : null) ??
                (typeof fromCustomer === "string" ||
                typeof fromCustomer === "number"
                    ? String(fromCustomer)
                    : null) ??
                ""
            if (!value && v.required) {
                return {
                    ok: false,
                    skipped_reason: `whatsapp ${event_name}: required var "${v.key}" not in data`,
                }
            }
            resolved.push(value)
        }

        // Render the body so SMS fallback has a sensible plaintext
        const brand = await mod.getBrandConfigView()
        const text = mod.renderWhatsappTemplateBody(tpl, resolved, brand)

        const result = await mod.sendPhoneMessage({
            to,
            text,
            template_slug: mapping.template_slug,
            template_variables: resolved,
        })
        if (!result?.ok) {
            return {
                ok: false,
                skipped_reason: `phone: ${result?.sent_via ?? "failed"}`,
            }
        }
        return { ok: true }
    } catch (err: any) {
        console.warn(
            `[polemarch_communication] dispatchPhone("${event_name}") failed: ${err?.message ?? err}`,
        )
        return {
            ok: false,
            skipped_reason: `phone error: ${err?.message ?? "unknown"}`,
        }
    }
}
