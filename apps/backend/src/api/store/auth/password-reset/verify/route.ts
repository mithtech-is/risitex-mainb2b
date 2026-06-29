import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { generateResetPasswordTokenWorkflow } from "@medusajs/core-flows"
import { z } from "zod"
import { createHash } from "node:crypto"
import { logger } from "../../../../../utils/logger"
import { respondOk, respondErr } from "../../../../../utils/envelope"

/**
 * POST /store/auth/password-reset/verify
 *
 * Step 2 of the OTP-based password reset flow. Verifies the 6-digit OTP
 * the user types on /forgot-password (after we sent it via password-reset/
 * send). On success we mint a real Medusa-format reset-password JWT via
 * `generateResetPasswordTokenWorkflow` and return it; the storefront then
 * submits the new password to Medusa's existing
 * `POST /auth/customer/emailpass/update?token=...` route.
 *
 * Body: { email, otp }
 *
 * Why mint via the workflow rather than write the password ourselves:
 *   - emailpass provider stores bcrypt(password) in
 *     `auth_identity.provider_metadata.password`. Writing it directly
 *     would couple us to Medusa internals + require adding bcryptjs.
 *   - The workflow returns the same JWT format Medusa's update endpoint
 *     expects, including expiry + revocation semantics (the token can
 *     only be used once before it's invalidated).
 *   - Keeps password storage as Medusa's responsibility — single
 *     source of truth.
 *
 * Caps OTP attempts at 5 — beyond that we lock the OTP out (user must
 * request a fresh send). Mirrors the email-otp/verify limit.
 */

const MAX_ATTEMPTS = 5

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
})

function hashOtp(customerId: string, otp: string): string {
  const secret = process.env.JWT_SECRET || process.env.COOKIE_SECRET || ""
  return createHash("sha256")
    .update(`${customerId}:${otp}:${secret}:pwreset`)
    .digest("hex")
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
  const { email, otp } = parsed.data

  const customerModule = req.scope.resolve(Modules.CUSTOMER) as any
  const matches = await customerModule
    .listCustomers({ email }, { take: 2, select: ["id", "email", "metadata"] })
    .catch(() => [] as any[])
  if (!matches || matches.length !== 1) {
    return respondErr(
      res,
      400,
      "auth.password_reset.invalid_otp",
      "Code didn't match. Try again or request a fresh code.",
    )
  }
  const customer = matches[0]
  const meta = (customer.metadata ?? {}) as Record<string, unknown>

  const storedHash = typeof meta.password_reset_otp_hash === "string"
    ? meta.password_reset_otp_hash
    : null
  const expiresAt = typeof meta.password_reset_otp_expires_at === "string"
    ? meta.password_reset_otp_expires_at
    : null
  const attemptCount = typeof meta.password_reset_otp_attempt_count === "number"
    ? meta.password_reset_otp_attempt_count
    : 0

  if (!storedHash || !expiresAt) {
    return respondErr(
      res,
      400,
      "auth.password_reset.no_pending_otp",
      "No active reset code. Request a new one.",
    )
  }
  if (Date.now() > Date.parse(expiresAt)) {
    return respondErr(
      res,
      400,
      "auth.password_reset.expired",
      "Code expired. Request a new one.",
    )
  }
  if (attemptCount >= MAX_ATTEMPTS) {
    return respondErr(
      res,
      429,
      "auth.password_reset.attempts_exhausted",
      "Too many wrong attempts. Request a fresh code.",
    )
  }

  const candidateHash = hashOtp(customer.id, otp)
  if (candidateHash !== storedHash) {
    const nextCount = attemptCount + 1
    await customerModule
      .updateCustomers(customer.id, {
        metadata: {
          ...meta,
          password_reset_otp_attempt_count: nextCount,
        },
      })
      .catch(() => {})
    return respondErr(
      res,
      400,
      "auth.password_reset.wrong_otp",
      "Code didn't match. Try again or request a fresh code.",
      { attempts_remaining: Math.max(0, MAX_ATTEMPTS - nextCount) },
    )
  }

  // Success — clear the OTP scaffolding so the same code can't be replayed.
  try {
    await customerModule.updateCustomers(customer.id, {
      metadata: {
        ...meta,
        password_reset_otp_hash: null,
        password_reset_otp_expires_at: null,
        password_reset_otp_attempt_count: null,
        password_reset_otp_channel: null,
      },
    })
  } catch (err) {
    logger.error("password-reset verify: failed to clear OTP keys", {
      customer_id: customer.id,
      error: (err as Error).message,
    })
    // Non-fatal — proceed to mint the reset token anyway.
  }

  // Mint a Medusa-format reset-password JWT. The workflow signs with
  // the same secret Medusa's emailpass-update endpoint validates with.
  const config: any = req.scope.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE,
  )
  const http = config.projectConfig.http
  const { result: token } = await generateResetPasswordTokenWorkflow(req.scope)
    .run({
      input: {
        entityId: email,
        actorType: "customer",
        provider: "emailpass",
        secret: http.jwtSecret,
        jwtOptions: http.jwtOptions,
      },
    })

  return respondOk(res, { reset_token: token, email: customer.email })
}
