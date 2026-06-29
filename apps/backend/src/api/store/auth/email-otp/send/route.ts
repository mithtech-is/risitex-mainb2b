import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createHash } from "node:crypto"
import {
    POLEMARCH_COMMUNICATION_MODULE,
    CommunicationModuleService,
} from "../../../../../modules/polemarch_communication"
import { hitRateLimit } from "../../../../../modules/cashfree_wallet/rate-limit"

/**
 * POST /store/auth/email-otp/send
 *
 * Issues an email OTP for the *currently authenticated customer*. The
 * email address is read from the session, NOT the request body — this
 * prevents an attacker from spamming OTPs to arbitrary inboxes.
 *
 * Rate-limited 3/min/IP and 5/hour/email (same envelope as phone-OTP)
 * so an authenticated abuser can't drain SMTP quota.
 *
 * Used by:
 *   - Sign-up flow → /auth/verify-email page (immediately after
 *     /auth/customer/emailpass register).
 *   - Account-page "verify my email" button.
 *
 * Response NEVER reveals whether the email matches a different
 * customer — we just send to the session email.
 *
 * Body: {} (no required fields — email comes from the session)
 *
 * Returns: { ok, otp_request_id, expires_at, sent_via, masked_email }
 */
const BodySchema = z.object({}).passthrough()

function ipHash(req: MedusaRequest): string {
    const ip = (req.ip as string | undefined) ?? "unknown"
    return createHash("sha256").update(`ip:${ip}`).digest("hex")
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({
            message: "Invalid payload",
            errors: parsed.error.flatten(),
        })
    }

    const customerId = (req as any).auth_context?.app_metadata
        ?.customer_id as string | undefined
    if (!customerId) {
        return res.status(401).json({
            ok: false,
            message:
                "Sign in first — email verification requires an authenticated session.",
        })
    }

    // Resolve the customer's email from the customer module — we never
    // trust an email address from the request body for OTP issuance.
    const customerModule: any = req.scope.resolve("customer")
    const customer = await customerModule
        .retrieveCustomer(customerId)
        .catch(() => null)
    const email = customer?.email as string | undefined
    if (!email) {
        return res.status(400).json({
            ok: false,
            message: "Your account has no email on file.",
        })
    }

    // Already verified — no need to send another code.
    const meta = (customer?.metadata ?? {}) as Record<string, unknown>
    if (meta.email_verified === true) {
        return res.status(409).json({
            ok: false,
            code: "auth.email_otp.already_verified",
            message: "Your email is already verified.",
        })
    }

    const ip = (req.ip as string | undefined) ?? "unknown"
    const rlIp = hitRateLimit(`email_otp_ip:${ip}`, 3, 60 * 1000)
    if (!rlIp.allowed) {
        return res.status(429).json({
            ok: false,
            message: "Too many OTP requests. Try again in a minute.",
            reset_at: rlIp.reset_at,
        })
    }
    const rlEmail = hitRateLimit(
        `email_otp_email:${email.toLowerCase()}`,
        5,
        60 * 60 * 1000,
    )
    if (!rlEmail.allowed) {
        return res.status(429).json({
            ok: false,
            message:
                "We've sent a few codes to your inbox recently. Try again in an hour.",
            reset_at: rlEmail.reset_at,
        })
    }

    const mod = req.scope.resolve(
        POLEMARCH_COMMUNICATION_MODULE,
    ) as CommunicationModuleService

    try {
        const result = await mod.createEmailOtp({
            email,
            purpose: "verify",
            customer_id: customerId,
            ip_hash: ipHash(req),
        })
        if (result.sent_via === "failed") {
            return res.status(502).json({
                ok: false,
                otp_request_id: result.otp_request_id,
                message:
                    "Couldn't send the verification email. Check your address and try again, or contact support.",
            })
        }
        return res.json({
            ok: true,
            otp_request_id: result.otp_request_id,
            expires_at: result.expires_at,
            sent_via: result.sent_via,
            masked_email: result.masked_email,
        })
    } catch (err: any) {
        console.error("[store/auth/email-otp/send] failed:", err)
        return res.status(500).json({
            ok: false,
            message: err?.message || "Failed to send OTP",
        })
    }
}
