import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import nodemailer from "nodemailer"
import {
    POLEMARCH_COMMUNICATION_MODULE,
    CommunicationModuleService,
} from "../modules/polemarch_communication"
import { sendEventNotification } from "../modules/polemarch_communication/helpers/send-event-email"

/**
 * Configure SMTP from env, then verify every transactional email path
 * end-to-end. Credentials come from the ENVIRONMENT — never hard-code
 * them in this file (it's committed).
 *
 *   SMTP_HOST=box.mith.in SMTP_PORT=465 SMTP_SECURE=true \
 *   SMTP_USERNAME=contact@example.in SMTP_PASSWORD='…' \
 *   SMTP_FROM_EMAIL=contact@example.in SMTP_FROM_NAME='RISITEX' \
 *   EMAIL_TEST_TO=someone@example.com \
 *   npx medusa exec ./src/scripts/setup-and-verify-email.ts
 *
 * Steps (each reported independently so a partial failure is legible):
 *   1. upsertSmtpConfig — password encrypted with AT_REST_ENCRYPTION_KEY.
 *   2. nodemailer verify() — the SMTP handshake / auth.
 *   3. Raw probe email.
 *   4. `company.approved` template — the "you're verified, sign in and
 *      start shopping" mail sent on wholesale approval.
 *   5. createEmailOtp — the signup email OTP (sent_via must be "email",
 *      not "failed").
 *
 * Omit EMAIL_TEST_TO to stop after the handshake (no mail is sent).
 * Omit SMTP_HOST to skip reconfiguration and just verify what's stored.
 */
export default async function setupAndVerifyEmail({ container }: ExecArgs) {
    const logger = container.resolve("logger") as any
    const mod = container.resolve(
        POLEMARCH_COMMUNICATION_MODULE,
    ) as CommunicationModuleService

    const host = process.env.SMTP_HOST
    const to = process.env.EMAIL_TEST_TO || ""
    const storefront = process.env.STOREFRONT_URL || "https://lamongie.in"

    // ── 1. Configure ────────────────────────────────────────────────
    if (host) {
        await mod.upsertSmtpConfig({
            host,
            port: Number(process.env.SMTP_PORT ?? 465),
            secure: String(process.env.SMTP_SECURE ?? "true") === "true",
            username: process.env.SMTP_USERNAME ?? null,
            // empty/undefined keeps any existing stored password
            password: process.env.SMTP_PASSWORD || undefined,
            from_email:
                process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USERNAME ?? "",
            from_name: process.env.SMTP_FROM_NAME ?? "RISITEX",
            reply_to: process.env.SMTP_REPLY_TO ?? null,
            enabled: true,
        })
        logger.info("[email-e2e] STEP 1 — SMTP config saved (password encrypted).")
    } else {
        logger.info("[email-e2e] STEP 1 — skipped (no SMTP_HOST); verifying stored config.")
    }

    const view = await mod.getSmtpConfigView()
    logger.info(`[email-e2e] stored config: ${JSON.stringify(view)}`)

    const cfg = await mod.getSmtpConfigDecrypted()
    if (!cfg) {
        logger.error("[email-e2e] SMTP is not configured — aborting.")
        process.exit(1)
        return
    }

    // ── 2. Handshake ────────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth:
            cfg.username && cfg.password
                ? { user: cfg.username, pass: cfg.password }
                : undefined,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
    })
    try {
        await transporter.verify()
        await mod.recordTestResult(true, null)
        logger.info("[email-e2e] STEP 2 OK — SMTP handshake + auth verified.")
    } catch (err: any) {
        await mod.recordTestResult(false, err?.message || "verify failed")
        logger.error(`[email-e2e] STEP 2 FAILED — handshake: ${err?.message}`)
        process.exit(2)
        return
    }

    if (!to) {
        logger.info("[email-e2e] EMAIL_TEST_TO unset — stopping after handshake (nothing sent).")
        return
    }

    // ── 3. Raw probe ────────────────────────────────────────────────
    try {
        const from = cfg.from_name
            ? `"${cfg.from_name}" <${cfg.from_email}>`
            : cfg.from_email
        const info = await transporter.sendMail({
            from,
            to,
            subject: "RISITEX SMTP probe",
            text: "If you received this, RISITEX SMTP is configured correctly.",
        })
        logger.info(`[email-e2e] STEP 3 OK — raw probe sent (id=${info.messageId}).`)
    } catch (err: any) {
        logger.error(`[email-e2e] STEP 3 FAILED — raw send: ${err?.message}`)
    }

    // ── 4. "You're verified" approval mail ──────────────────────────
    const approved = await mod.sendEmail({
        to,
        template_slug: "company.approved",
        data: {
            customer: { first_name: "Aarav", email: to },
            first_name: "Aarav",
            trade_name: "Coimbatore Textile Distributors",
            gstin: "33ABCCC1234A1Z5",
            tier_name: "Silver",
            payment_terms: "Net 30",
            login_url: `${storefront}/auth/sign-in?email=${encodeURIComponent(to)}`,
            storefront_url: storefront,
        },
    })
    logger.info(`[email-e2e] STEP 4 company.approved → ${JSON.stringify(approved)}`)

    // ── 5. Signup email OTP ─────────────────────────────────────────
    try {
        const otp = await mod.createEmailOtp({ email: to, purpose: "verify" })
        logger.info(
            `[email-e2e] STEP 5 email OTP → sent_via=${otp.sent_via} masked=${otp.masked_email} ` +
                `${otp.sent_via === "email" ? "(OK)" : "(FAILED — SMTP send did not go through)"}`,
        )
    } catch (err: any) {
        logger.error(`[email-e2e] STEP 5 FAILED — email OTP: ${err?.message}`)
    }

    // ── 6. The REAL trigger path ────────────────────────────────────
    // Steps 3-4 talk to SMTP / the template directly. This exercises what
    // POST /admin/companies/applications/:id/approve actually calls:
    // sendEventNotification → WhatsappEventMap/EventTemplateMap lookup →
    // customer-email resolution from customer_id → sendEmail. Opt-in
    // (VERIFY_EVENT_PATH=true) because it touches the customer table.
    if (process.env.VERIFY_EVENT_PATH === "true") {
        try {
            const customerModule: any = container.resolve(Modules.CUSTOMER)
            let [cust] = await customerModule.listCustomers({ email: to }, { take: 1 })
            if (!cust) {
                ;[cust] = await customerModule.createCustomers([
                    {
                        email: to,
                        first_name: "Aarav",
                        has_account: false,
                        metadata: { source: "email-e2e-probe" },
                    },
                ])
                logger.info(`[email-e2e] STEP 6 created probe customer ${cust.id}`)
            }
            const r = await sendEventNotification(container, "company.approved", {
                customer_id: cust.id,
                trade_name: "Coimbatore Textile Distributors",
                gstin: "33ABCCC1234A1Z5",
                tier_name: "Silver",
                payment_terms: "Net 30",
                login_url: `${storefront}/auth/sign-in?email=${encodeURIComponent(to)}`,
                storefront_url: storefront,
            })
            logger.info(
                `[email-e2e] STEP 6 event path (customer_id=${cust.id}) → ${JSON.stringify(r)}`,
            )
        } catch (err: any) {
            logger.error(`[email-e2e] STEP 6 FAILED — event path: ${err?.message}`)
        }
    }

    // ── 7. Recent delivery log ──────────────────────────────────────
    try {
        const logs: any[] = await (mod as any).listEmailLogs(
            {},
            { take: 6, order: { created_at: "DESC" } },
        )
        logger.info(
            `[email-e2e] recent email log: ${JSON.stringify(
                (logs || []).map((l) => ({
                    to: l.to_email,
                    slug: l.template_slug,
                    status: l.status,
                    error: l.error,
                })),
            )}`,
        )
    } catch {
        /* log listing is diagnostic only */
    }

    logger.info("[email-e2e] done.")
}
