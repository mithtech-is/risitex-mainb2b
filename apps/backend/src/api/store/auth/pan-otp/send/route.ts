import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createHash } from "node:crypto"
import {
  POLEMARCH_COMMUNICATION_MODULE,
  CommunicationModuleService,
} from "../../../../../modules/polemarch_communication"
import { hitRateLimit } from "../../../../../modules/cashfree_wallet/rate-limit"

/**
 * POST /store/auth/pan-otp/send  (FR-1.04a — PAN-linked phone verification)
 *
 * Sends a phone OTP tied to a PAN claim. Reuses the existing phone-OTP
 * pipeline (WhatsApp-first, SMS fallback, rate limited) — the only
 * difference is that the request body carries a PAN, and on successful
 * verification both `pan_verified` and `phone_verified` flags are stamped
 * onto the customer in a single round-trip.
 *
 * This route does NOT call a third-party PAN-registry API (Karza /
 * Sandbox / IDfy). Genuine PAN-name match requires a paid provider and
 * is the obvious next upgrade — the verify route already exposes a
 * `pan_match_verified` flag wired to `false` so swapping in a real
 * provider response is a one-line change. The phone OTP is enough on
 * its own to prove ownership of the contact channel the buyer claimed.
 *
 * Body:
 *   { pan: "AAAPL1234C", phone_e164: "+91..." }
 */
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/

const BodySchema = z.object({
  pan: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => PAN_REGEX.test(v), {
      message: "PAN must be a 10-character Indian PAN (e.g. AAAPL1234C)",
    }),
  phone_e164: z
    .string()
    .min(8)
    .max(20)
    .regex(/^\+[1-9]\d{6,18}$/, "phone must be in E.164 form (+91…)"),
})

function ipHash(req: MedusaRequest): string {
  const ip = (req.ip as string | undefined) ?? "unknown"
  return createHash("sha256").update(`ip:${ip}`).digest("hex")
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid payload",
      errors: parsed.error.flatten(),
    })
  }
  const { pan, phone_e164 } = parsed.data

  // Caller must be authenticated — the verify route stamps PAN onto
  // their customer row, so we need the customer id at send time too so
  // we can bind the OTP to it (defense-in-depth against an attacker
  // swapping request ids between sessions).
  const customerId = (req as any).auth_context?.app_metadata?.customer_id as
    | string
    | undefined
  if (!customerId) {
    return res.status(401).json({
      ok: false,
      message:
        "Sign in first — PAN verification requires an authenticated session.",
    })
  }

  // Two-axis rate-limit: IP (deter scraping) + PAN (deter bombing
  // someone else's PAN with OTP texts to extract their phone number).
  const ip = (req.ip as string | undefined) ?? "unknown"
  const rlIp = hitRateLimit(`pan_otp_ip:${ip}`, 3, 60 * 1000)
  if (!rlIp.allowed) {
    return res.status(429).json({
      ok: false,
      message: "Too many OTP requests. Try again in a minute.",
      reset_at: rlIp.reset_at,
    })
  }
  const rlPan = hitRateLimit(`pan_otp_pan:${pan}`, 5, 60 * 60 * 1000)
  if (!rlPan.allowed) {
    return res.status(429).json({
      ok: false,
      message:
        "We've issued several PAN OTPs against this number recently. Try again in an hour.",
      reset_at: rlPan.reset_at,
    })
  }

  const mod = req.scope.resolve(
    POLEMARCH_COMMUNICATION_MODULE,
  ) as CommunicationModuleService

  try {
    const result = await mod.createPhoneOtp({
      phone_e164,
      purpose: "verify",
      customer_id: customerId,
      ip_hash: ipHash(req),
    })
    if (result.sent_via === "failed") {
      return res.status(502).json({
        ok: false,
        otp_request_id: result.otp_request_id,
        message:
          "Couldn't send the OTP. Both WhatsApp and SMS failed — retry shortly.",
      })
    }
    return res.json({
      ok: true,
      otp_request_id: result.otp_request_id,
      expires_at: result.expires_at,
      sent_via: result.sent_via,
      masked_phone: result.masked_phone,
      pan_masked: `${pan.slice(0, 3)}****${pan.slice(-2)}`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[store/auth/pan-otp/send] failed:", msg)
    return res.status(502).json({
      ok: false,
      message: "Couldn't send the OTP. Try again shortly.",
    })
  }
}
