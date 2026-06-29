import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
    POLEMARCH_COMMUNICATION_MODULE,
    CommunicationModuleService,
} from "../../../../../modules/polemarch_communication"
import { hitRateLimit } from "../../../../../modules/cashfree_wallet/rate-limit"

/**
 * POST /store/auth/email-otp/resend
 *
 * Rotate the OTP on an existing request and re-dispatch via email.
 * Rate-limited 1/60s/IP — the 60-second resend cooldown the spec
 * requires.
 *
 * Body: { otp_request_id }
 */
const BodySchema = z.object({
    otp_request_id: z.string().min(1),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({
            message: "Invalid payload",
            errors: parsed.error.flatten(),
        })
    }
    const { otp_request_id } = parsed.data

    const customerId = (req as any).auth_context?.app_metadata
        ?.customer_id as string | undefined
    if (!customerId) {
        return res.status(401).json({
            ok: false,
            message: "Sign in first.",
        })
    }

    const ip = (req.ip as string | undefined) ?? "unknown"
    // 1/60s cooldown — the storefront's "Resend" button is also gated
    // client-side, but the server is authoritative.
    const rl = hitRateLimit(
        `email_otp_resend_ip:${ip}`,
        1,
        60 * 1000,
    )
    if (!rl.allowed) {
        return res.status(429).json({
            ok: false,
            message: "Please wait 60 seconds before requesting another code.",
            reset_at: rl.reset_at,
        })
    }

    const mod = req.scope.resolve(
        POLEMARCH_COMMUNICATION_MODULE,
    ) as CommunicationModuleService

    try {
        const result = await mod.resendEmailOtp({ otp_request_id })
        if (!result.ok) {
            return res.status(400).json({
                ok: false,
                sent_via: result.sent_via,
                masked_email: result.masked_email,
                message: result.reason ?? "Resend failed",
            })
        }
        return res.json({
            ok: true,
            sent_via: result.sent_via,
            masked_email: result.masked_email,
            expires_at: result.expires_at,
        })
    } catch (err: any) {
        console.error("[store/auth/email-otp/resend] failed:", err)
        return res.status(500).json({
            ok: false,
            message: err?.message || "Failed to resend OTP",
        })
    }
}
