import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { createHash, randomInt } from "node:crypto"
import { sendEventEmail } from "../../../../../modules/polemarch_communication/helpers/send-event-email"
import {
  POLEMARCH_COMMUNICATION_MODULE,
  CommunicationModuleService,
} from "../../../../../modules/polemarch_communication"
import { hitRateLimit } from "../../../../../modules/cashfree_wallet/rate-limit"
import { logger } from "../../../../../utils/logger"
import { respondOk, respondErr } from "../../../../../utils/envelope"

/**
 * POST /store/auth/password-reset/send
 *
 * Step 1 of the OTP-based password reset flow. Replaces the legacy
 * email-link reset (`POST /auth/customer/emailpass/reset-password`)
 * that was retired in favour of an OTP the user types on the storefront.
 *
 * Body: { email: string, channel?: "email" | "phone" }
 *   - channel="email" (default) → sends OTP via email (auth.password_reset_otp template)
 *   - channel="phone" → looks up the customer's phone (must be verified),
 *     sends OTP via WhatsApp (Polygin) with SMS fallback (MSG91)
 *
 * Anti-enumeration: ALWAYS responds 200 with `masked_destination`,
 * regardless of whether the email matches a real customer. The actual
 * send is silently skipped if no customer matches.
 *
 * Rate-limited 3/hour per email-or-IP to keep abuse + provider quotas
 * in check. Limit is intentionally on the email so bots can't burn
 * through OTPs by rotating IPs.
 */

const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email"),
  channel: z.enum(["email", "phone"]).default("email"),
})

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

function hashOtp(customerId: string, otp: string): string {
  const secret = process.env.JWT_SECRET || process.env.COOKIE_SECRET || ""
  return createHash("sha256")
    .update(`${customerId}:${otp}:${secret}:pwreset`)
    .digest("hex")
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return email
  const visible = local.slice(0, 2)
  return `${visible}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return ""
  const last4 = phone.slice(-4)
  const cc = phone.length > 10 ? phone.slice(0, phone.length - 10) : ""
  return `${cc}${"*".repeat(Math.max(0, phone.length - cc.length - 4))}${last4}`
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return respondErr(
      res,
      400,
      "auth.password_reset.invalid_payload",
      "Invalid payload",
      { errors: parsed.error.flatten() },
    )
  }
  const { email, channel } = parsed.data

  // Rate-limit per email so an attacker can't burn through 100 OTPs
  // for the same victim by rotating IPs.
  const rl = hitRateLimit(`pwreset:${email}`, 3, 60 * 60 * 1000)
  if (!rl.allowed) {
    return respondErr(
      res,
      429,
      "auth.password_reset.rate_limit",
      "Too many reset requests for this email. Try again later.",
      { reset_at: rl.reset_at },
    )
  }

  // Look up customer. Anti-enumerate: respond OK regardless of result.
  const customerModule = req.scope.resolve(Modules.CUSTOMER) as any
  const matches = await customerModule
    .listCustomers({ email }, { take: 2, select: ["id", "email", "phone", "metadata"] })
    .catch(() => [] as any[])

  // Always respond as if it worked — the masked destination is computed
  // optimistically. If no customer matches, this is the only "tell" but
  // it's a benign one (the masked email/phone they'd get back is what
  // they typed in, just masked).
  const okShape = (channel: string, masked: string) =>
    respondOk(res, { channel, masked_destination: masked, ttl_seconds: OTP_TTL_MS / 1000 })

  if (!matches || matches.length === 0) {
    return okShape(channel, channel === "email" ? maskEmail(email) : "—")
  }
  if (matches.length > 1) {
    // Two accounts share an email — Medusa shouldn't allow this but if it
    // happens we refuse the reset (can't pick which one). User must
    // contact support.
    logger.warn("password-reset: multiple customers for email", { email })
    return okShape(channel, channel === "email" ? maskEmail(email) : "—")
  }
  const customer = matches[0]

  // Phone-channel guards — must have a verified phone on file.
  const meta = (customer.metadata ?? {}) as Record<string, unknown>
  if (channel === "phone") {
    if (!customer.phone || meta.phone_verified !== true) {
      // Don't leak that there's no verified phone — return OK with a
      // dummy masked destination. The user will see "no OTP arrived"
      // and try the email channel instead.
      return okShape("phone", maskPhone(customer.phone) || "—")
    }
  }

  // Generate + persist OTP. Reset attempt counter + clear any prior
  // pending OTP so the latest send always starts a fresh window.
  const otp = generateOtp()
  const otpHash = hashOtp(customer.id, otp)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()
  try {
    await customerModule.updateCustomers(customer.id, {
      metadata: {
        ...meta,
        password_reset_otp_hash: otpHash,
        password_reset_otp_expires_at: expiresAt,
        password_reset_otp_attempt_count: 0,
        password_reset_otp_channel: channel,
      },
    })
  } catch (err) {
    logger.error("password-reset send: failed to persist hash", {
      customer_id: customer.id,
      error: (err as Error).message,
    })
    // Fall through — anti-enum response below. The user can retry.
    return okShape(channel, channel === "email" ? maskEmail(email) : maskPhone(customer.phone))
  }

  // Dispatch via the requested channel. Best-effort — send_event_email
  // and sendPhoneMessage both swallow errors and log; we don't surface
  // delivery failure to the client (anti-enum).
  if (channel === "email") {
    await sendEventEmail(req.scope, "auth.password_reset_otp", {
      customer: { first_name: customer.first_name ?? "", email: customer.email },
      otp,
      expires_in: "10 minutes",
    })
    return okShape("email", maskEmail(email))
  }

  // channel === "phone" → use the dedicated `auth.password_reset_otp`
  // template (added 2026-05-03 alongside the email template of the
  // same slug). Earlier this reused `auth.phone_otp_login` because the
  // dedicated template didn't exist; functionally identical (both are
  // AUTHENTICATION-category OTP-COPY_CODE templates), but the
  // dedicated slug gives admins clearer audit trails per channel.
  // SMS fallback via MSG91 happens automatically inside
  // sendPhoneMessage when WhatsApp fails or isn't configured.
  const commModule = req.scope.resolve(
    POLEMARCH_COMMUNICATION_MODULE,
  ) as CommunicationModuleService
  await commModule
    .sendPhoneMessage({
      to: customer.phone!,
      text: `Your Risitex password reset code is ${otp}. Valid for 10 minutes. Don't share this with anyone.`,
      template_slug: "auth.password_reset_otp",
      template_variables: [otp],
    })
    .catch((err) => {
      logger.error("password-reset send: phone dispatch failed", {
        customer_id: customer.id,
        error: (err as Error).message,
      })
    })

  return okShape("phone", maskPhone(customer.phone))
}
