import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
    POLEMARCH_COMMUNICATION_MODULE,
    CommunicationModuleService,
} from "../../../../../modules/polemarch_communication"
import { hitRateLimit } from "../../../../../modules/cashfree_wallet/rate-limit"

/**
 * POST /store/auth/phone-otp/resend
 *
 * Re-runs the WhatsApp → SMS dispatch for an existing OTP request. We
 * generate a fresh OTP (the original is hashed + can't be recovered),
 * persist a new salt+hash on the same row, and re-send. This avoids the
 * UX trap of "didn't get the code → click resend → still doesn't work
 * because the row got into a permanent bad state".
 *
 * Rate-limited 3/min/IP — same bucket as `send` so a misbehaving client
 * can't drain provider quota by alternating send + resend.
 */
const BodySchema = z.object({
    otp_request_id: z.string().min(1),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) {
        return res
            .status(400)
            .json({ ok: false, message: "Invalid payload" })
    }

    const ip = (req.ip as string | undefined) ?? "unknown"
    const rl = hitRateLimit(`otp_resend_ip:${ip}`, 3, 60 * 1000)
    if (!rl.allowed) {
        return res.status(429).json({
            ok: false,
            message: "Too many resends. Try again in a minute.",
            reset_at: rl.reset_at,
        })
    }

    const mod = req.scope.resolve(
        POLEMARCH_COMMUNICATION_MODULE,
    ) as CommunicationModuleService

    const result = await mod.resendPhoneOtp({
        otp_request_id: parsed.data.otp_request_id,
    })

    if (!result.ok) {
        return res.status(400).json({
            ok: false,
            message: result.reason || "Resend failed",
            sent_via: result.sent_via,
            masked_phone: result.masked_phone,
        })
    }
    return res.json({
        ok: true,
        sent_via: result.sent_via,
        masked_phone: result.masked_phone,
        expires_at: result.expires_at,
    })
}
