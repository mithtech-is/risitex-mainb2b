import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { Modules } from "@medusajs/framework/utils"
import { createHash } from "node:crypto"
import { logger } from "../../../../../utils/logger"
import { respondOk, respondErr } from "../../../../../utils/envelope"
import { sendEventEmail } from "../../../../../modules/polemarch_communication/helpers/send-event-email"

/**
 * POST /store/me/email-otp/verify
 *   Body: { otp: string }
 *
 * Validates the OTP against the SHA-256-with-server-secret hash
 * stashed by /store/me/email-otp/send. On success: sets
 * `customer.metadata.email_verified = true` and clears the OTP
 * fields. On failure: increments `email_otp_attempt_count`; after
 * 5 wrong attempts the OTP is invalidated (must request a new one).
 */
const Schema = z.object({
  otp: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, ""))
    .refine((s) => /^\d{4,8}$/.test(s), "OTP must be 4–8 digits"),
})

const MAX_ATTEMPTS = 5

function hashOtp(customerId: string, otp: string): string {
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

  const parsed = Schema.safeParse(req.body)
  if (!parsed.success) {
    return respondErr(
      res,
      400,
      "auth.email_otp.invalid_payload",
      "Enter the 6-digit code from the verification email.",
    )
  }
  const { otp } = parsed.data

  const customerModule = req.scope.resolve(Modules.CUSTOMER) as any
  const customer = await customerModule
    .retrieveCustomer(customerId)
    .catch(() => null)
  if (!customer) return respondErr(res, 404, "auth.email_otp.no_customer", "Customer not found")

  const meta = (customer.metadata ?? {}) as Record<string, unknown>

  if (meta.email_verified === true) {
    return respondOk(res, { email_verified: true, already_verified: true })
  }

  const storedHash =
    typeof meta.email_otp_hash === "string" ? meta.email_otp_hash : null
  const expiresAtStr =
    typeof meta.email_otp_expires_at === "string"
      ? meta.email_otp_expires_at
      : null
  if (!storedHash || !expiresAtStr) {
    return respondErr(
      res,
      400,
      "auth.email_otp.no_active",
      "No active OTP. Click 'Send OTP' to get a fresh code.",
    )
  }

  const expiresAt = Date.parse(expiresAtStr)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    // Clear stale OTP fields so a stale "Verify" click doesn't keep
    // failing in the same way.
    try {
      await customerModule.updateCustomers(customerId, {
        metadata: {
          ...meta,
          email_otp_hash: null,
          email_otp_expires_at: null,
          email_otp_attempt_count: null,
        },
      })
    } catch {
      /* non-fatal */
    }
    return respondErr(
      res,
      400,
      "auth.email_otp.expired",
      "OTP has expired. Click 'Send OTP' to get a fresh code.",
    )
  }

  const attemptCount =
    typeof meta.email_otp_attempt_count === "number"
      ? meta.email_otp_attempt_count
      : 0

  const submittedHash = hashOtp(customerId, otp)
  const ok = submittedHash === storedHash

  if (!ok) {
    const nextCount = attemptCount + 1
    const lockOut = nextCount >= MAX_ATTEMPTS
    try {
      await customerModule.updateCustomers(customerId, {
        metadata: {
          ...meta,
          email_otp_attempt_count: nextCount,
          // After MAX_ATTEMPTS wrong tries, invalidate the OTP so
          // brute-forcing the 6-digit space is impossible.
          ...(lockOut
            ? {
                email_otp_hash: null,
                email_otp_expires_at: null,
                email_otp_attempt_count: null,
              }
            : {}),
        },
      })
    } catch (err) {
      logger.warn("email-otp verify: failed to persist attempt count", {
        customer_id: customerId,
        error: (err as Error).message,
      })
    }
    return respondErr(
      res,
      400,
      lockOut ? "auth.email_otp.too_many_attempts" : "auth.email_otp.wrong_otp",
      lockOut
        ? "Too many wrong attempts. Click 'Send OTP' to get a fresh code."
        : "That code didn't match. Try again or click 'Send OTP' to get a fresh code.",
      { attempts_remaining: Math.max(0, MAX_ATTEMPTS - nextCount) },
    )
  }

  // Success — flip email_verified, clear OTP scaffolding.
  try {
    await customerModule.updateCustomers(customerId, {
      metadata: {
        ...meta,
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        email_otp_hash: null,
        email_otp_expires_at: null,
        email_otp_attempt_count: null,
      },
    })
  } catch (err) {
    logger.error("email-otp verify: failed to flip email_verified", {
      customer_id: customerId,
      error: (err as Error).message,
    })
    return respondErr(res, 500, "auth.email_otp.update_failed", "Failed to mark email verified")
  }

  // Best-effort confirmation email — per the May-2026 notification
  // policy, every step gets an email update; phone (WhatsApp) is
  // reserved for the invest-ready milestone only.
  try {
    await sendEventEmail(req.scope, "account.email_verified", {
      customer_id: customerId,
    })
  } catch (emailErr) {
    logger.warn("account.email_verified email failed (non-blocking)", {
      customer_id: customerId,
      error: (emailErr as Error).message,
    })
  }

  return respondOk(res, { email_verified: true })
}
