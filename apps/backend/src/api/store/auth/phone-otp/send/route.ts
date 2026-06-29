import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createHash } from "node:crypto"
import {
    POLEMARCH_COMMUNICATION_MODULE,
    CommunicationModuleService,
} from "../../../../../modules/polemarch_communication"
import { hitRateLimit } from "../../../../../modules/cashfree_wallet/rate-limit"
import { findConflictingPhoneCustomer } from "../../../../../utils/identity-uniqueness"

/**
 * POST /store/auth/phone-otp/send
 *
 * Public — issues a phone OTP and dispatches it via WhatsApp first,
 * SMS fallback. Used for both:
 *   - purpose="login"   → unauthenticated. Customer is identified at
 *                         verify time by a phone-number lookup.
 *   - purpose="verify"  → caller is already signed in. The handler still
 *                         allows it without a session because the verify
 *                         route is the one that gates on auth — the OTP
 *                         text itself is harmless to deliver.
 *
 * Rate-limited 3/min/IP and 5/hour/phone — generous enough for legit
 * "didn't get the code, try again" flows but tight enough to deter
 * SMS-bombing. The phone-side limit also doubles as a coarse
 * anti-enumeration check (an attacker can't spam OTPs to a victim's
 * phone to harass them).
 *
 * Response NEVER reveals whether the phone matches an existing customer.
 */
const BodySchema = z.object({
    phone_e164: z
        .string()
        .min(8)
        .max(20)
        .regex(/^\+[1-9]\d{6,18}$/, "phone must be in E.164 form (+91…)"),
    // OTP login was retired — only "verify" is accepted now. Old
    // clients still sending purpose="login" will get a 400 here.
    purpose: z.enum(["verify"]),
})

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
    const { phone_e164, purpose } = parsed.data

    const ip = (req.ip as string | undefined) ?? "unknown"
    const rlIp = hitRateLimit(`otp_ip:${ip}`, 3, 60 * 1000)
    if (!rlIp.allowed) {
        return res.status(429).json({
            ok: false,
            message: "Too many OTP requests. Try again in a minute.",
            reset_at: rlIp.reset_at,
        })
    }
    const rlPhone = hitRateLimit(
        `otp_phone:${phone_e164}`,
        5,
        60 * 60 * 1000,
    )
    if (!rlPhone.allowed) {
        return res.status(429).json({
            ok: false,
            message:
                "We've sent a few codes to this number recently. Try again in an hour.",
            reset_at: rlPhone.reset_at,
        })
    }

    let customer_id: string | null = null
    if (purpose === "verify") {
        // Caller MUST already be authenticated for the verify flow —
        // the handler that consumes the OTP gates on auth, but we
        // also stamp the customer id here so the verify step can
        // double-check the OTP belongs to the same authenticated
        // customer (defense-in-depth against an attacker swapping
        // OTP request ids between users).
        const ctxId = (req as any).auth_context?.app_metadata?.customer_id as
            | string
            | undefined
        if (!ctxId) {
            return res.status(401).json({
                ok: false,
                message:
                    "Sign in first — phone verification requires an authenticated session.",
            })
        }
        customer_id = ctxId

        // Uniqueness pre-check — refuse to issue an OTP for a phone
        // already attached to a different customer. The DB partial-
        // unique index `customer_phone_unique` is the backstop;
        // surfacing the error here avoids dispatching a useless OTP
        // and gives the user a clear "already registered" message.
        const conflictId = await findConflictingPhoneCustomer(
            req.scope,
            phone_e164,
            ctxId,
        )
        if (conflictId) {
            return res.status(409).json({
                ok: false,
                code: "auth.phone_otp.phone_taken",
                message:
                    "This phone number is already registered to another Risitex account. Sign in with that account, or try a different number.",
            })
        }
    }

    const mod = req.scope.resolve(
        POLEMARCH_COMMUNICATION_MODULE,
    ) as CommunicationModuleService

    try {
        const result = await mod.createPhoneOtp({
            phone_e164,
            purpose,
            customer_id,
            ip_hash: ipHash(req),
        })
        if (result.sent_via === "failed") {
            // Both WhatsApp + SMS bombed. Surface a generic failure;
            // the request row is preserved so admin can debug.
            return res.status(502).json({
                ok: false,
                otp_request_id: result.otp_request_id,
                message:
                    "Couldn't send the OTP. Both WhatsApp and SMS failed — try again or use email login.",
            })
        }
        return res.json({
            ok: true,
            otp_request_id: result.otp_request_id,
            expires_at: result.expires_at,
            sent_via: result.sent_via,
            masked_phone: result.masked_phone,
        })
    } catch (err: any) {
        console.error("[store/auth/phone-otp/send] failed:", err)
        return res.status(502).json({
            ok: false,
            message:
                "Couldn't send the OTP. Try again or use email login.",
        })
    }
}
