import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { createHash, randomInt } from "node:crypto"
import { sendEventEmail } from "../../../../../modules/polemarch_communication/helpers/send-event-email"
import { hitRateLimit } from "../../../../../modules/cashfree_wallet/rate-limit"
import { logger } from "../../../../../utils/logger"
import { respondOk, respondErr } from "../../../../../utils/envelope"

/**
 * POST /store/me/email-otp/send
 *
 * Generates a 6-digit OTP, salt-hashes it onto
 * `customer.metadata.email_otp_*`, and sends it via the existing
 * polemarch_communication module (template slug `auth.email_otp`, event
 * `auth.email_otp`). Plaintext OTP is NEVER persisted — only the
 * SHA-256 hash with a server-side secret salt.
 *
 * Rate-limited 3/hour, 10/day per customer to prevent abuse +
 * keep email-provider quotas honest.
 *
 * No request body needed — recipient is the customer's account
 * email (the address they're verifying).
 */
const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes

function generateOtp(): string {
  // 6-digit zero-padded numeric. randomInt is crypto-grade.
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

function hashOtp(customerId: string, otp: string): string {
  // HMAC-style salt: customer_id + a server secret keep the hash
  // resistant to rainbow tables on the 6-digit space (10^6 entries).
  const secret = process.env.JWT_SECRET || process.env.COOKIE_SECRET || ""
  return createHash("sha256")
    .update(`${customerId}:${otp}:${secret}`)
    .digest("hex")
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata?.customer_id as
    | string
    | undefined
  if (!customerId) return respondErr(res, 401, "auth.unauthenticated", "Not authenticated")

  // Rate-limit per customer (in-memory bucket, same as Aadhaar OTP path).
  const rlHour = hitRateLimit(`email_otp_hr:${customerId}`, 3, 60 * 60 * 1000)
  if (!rlHour.allowed) {
    return respondErr(
      res,
      429,
      "auth.email_otp.rate_limit_hour",
      "Too many OTP requests in the last hour. Try again later.",
      { reset_at: rlHour.reset_at },
    )
  }
  const rlDay = hitRateLimit(`email_otp_day:${customerId}`, 10, 24 * 60 * 60 * 1000)
  if (!rlDay.allowed) {
    return respondErr(
      res,
      429,
      "auth.email_otp.rate_limit_day",
      "Daily OTP limit reached. Try again tomorrow.",
      { reset_at: rlDay.reset_at },
    )
  }

  const customerModule = req.scope.resolve(Modules.CUSTOMER) as any
  const customer = await customerModule
    .retrieveCustomer(customerId)
    .catch(() => null)
  if (!customer || !customer.email) {
    return respondErr(res, 404, "auth.email_otp.no_email", "Customer email not found")
  }

  const meta = (customer.metadata ?? {}) as Record<string, unknown>
  if (meta.email_verified === true) {
    return respondErr(
      res,
      409,
      "auth.email_otp.already_verified",
      "Your email is already verified.",
    )
  }

  const otp = generateOtp()
  const otpHash = hashOtp(customerId, otp)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

  // Persist hash + expiry. Reset attempt counter on every fresh send
  // so a previous "wrong OTP" run doesn't permanently lock them out.
  try {
    await customerModule.updateCustomers(customerId, {
      metadata: {
        ...meta,
        email_otp_hash: otpHash,
        email_otp_expires_at: expiresAt,
        email_otp_attempt_count: 0,
      },
    })
  } catch (err) {
    logger.error("email-otp send: failed to persist hash", {
      customer_id: customerId,
      error: (err as Error).message,
    })
    return respondErr(res, 500, "auth.email_otp.issue_failed", "Failed to issue OTP")
  }

  // Fire the email. sendEventEmail never throws — failures are
  // logged + we surface a generic error.
  const result = await sendEventEmail(req.scope, "auth.email_otp", {
    customer: { first_name: customer.first_name ?? "", email: customer.email },
    otp,
    expires_in: "10 minutes",
  })
  if (!result.ok) {
    return respondErr(
      res,
      502,
      "auth.email_otp.delivery_failed",
      "Couldn't send OTP email. Try again in a minute.",
      { reason: (result as { skipped_reason?: string }).skipped_reason },
    )
  }

  return respondOk(res, {
    expires_at: expiresAt,
    // Don't echo the OTP — the email is the only delivery channel.
    sent_to: customer.email,
  })
}
