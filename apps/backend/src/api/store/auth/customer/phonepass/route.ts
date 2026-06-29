import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { z } from "zod"
import { hitRateLimit } from "../../../../../modules/cashfree_wallet/rate-limit"
import { logger } from "../../../../../utils/logger"
import { respondOk, respondErr } from "../../../../../utils/envelope"

/**
 * POST /store/auth/customer/phonepass
 *
 * Phone-number + password login. Returns the same `{ token }` shape as
 * Medusa's built-in `/auth/customer/emailpass` so the storefront can
 * stash it in localStorage as `medusa_auth_token` exactly like the
 * email path does.
 *
 * Why a custom route rather than a Medusa auth provider:
 *   - Medusa's auth_identity is keyed by `entity_id` which the
 *     emailpass provider sets to the email at registration. There's no
 *     supported way to register/lookup a separate phone-pass identity
 *     without owning a full provider implementation.
 *   - This shim accepts the spec's UX (phone OR email + password) by
 *     resolving the verified-phone → customer → email → emailpass
 *     authenticate. The user never knows their email is doing the
 *     heavy lifting backend-side.
 *   - Uniform anti-enumeration: same generic error whether the phone
 *     doesn't exist, isn't verified, or the password is wrong.
 *
 * Body: { phone_e164: "+91…", password }
 * Response: { token: <Medusa-format JWT> }
 *
 * Rate-limit: 5 attempts/15min per phone (same posture as emailpass
 * lockout behind /auth/customer/emailpass).
 */
const BodySchema = z.object({
  phone_e164: z
    .string()
    .min(8)
    .max(20)
    .regex(/^\+[1-9]\d{6,18}$/, "phone must be in E.164 form (+91…)"),
  password: z.string().min(1, "password required"),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return respondErr(
      res,
      400,
      "auth.phonepass.invalid_payload",
      "Invalid payload",
      { errors: parsed.error.flatten() },
    )
  }
  const { phone_e164, password } = parsed.data

  // Per-phone rate-limit. Generic enough to hold both legitimate
  // "I mistyped my password 3 times" and brute-force attempts.
  const rl = hitRateLimit(`phonepass:${phone_e164}`, 5, 15 * 60 * 1000)
  if (!rl.allowed) {
    return respondErr(
      res,
      429,
      "auth.phonepass.rate_limit",
      "Too many login attempts for this number. Try again later.",
      { reset_at: rl.reset_at },
    )
  }

  const customerModule = req.scope.resolve(Modules.CUSTOMER) as any
  const matches = await customerModule
    .listCustomers(
      { phone: phone_e164 },
      { take: 2, select: ["id", "phone", "email", "metadata"] },
    )
    .catch(() => [] as any[])

  // Generic error on every failure mode below — no enumeration.
  const generic = () =>
    respondErr(
      res,
      401,
      "auth.phonepass.invalid_credentials",
      "Phone or password didn't match.",
    )

  if (!matches || matches.length === 0) return generic()
  if (matches.length > 1) {
    // Two accounts share a phone number — Medusa shouldn't allow this
    // but be defensive. Refuse and tell the user (different shape since
    // it's a help-needed case, not an auth failure).
    logger.warn("phonepass: multiple customers for phone", { phone_e164 })
    return respondErr(
      res,
      409,
      "auth.phonepass.multiple_accounts",
      "Multiple accounts share this phone number. Please sign in with email instead.",
    )
  }
  const customer = matches[0]
  const meta = (customer.metadata ?? {}) as Record<string, unknown>

  // Phone must be VERIFIED — unverified phones are presence-only and
  // can't be trusted as a login identifier (someone could've signed up
  // with a phone they don't control).
  if (meta.phone_verified !== true) {
    return generic()
  }
  if (!customer.email) {
    // Edge case — customer with phone but no email. Can't run emailpass
    // verification. Treat as auth failure rather than crash.
    return generic()
  }

  // Verify the password by replaying Medusa's emailpass authenticate
  // flow with the customer's email as identifier.
  const authModule = req.scope.resolve(Modules.AUTH) as any
  const verify = await authModule
    .authenticate("emailpass", {
      url: req.url,
      headers: req.headers,
      query: req.query,
      protocol: (req as any).protocol,
      body: { email: customer.email, password },
    })
    .catch((err: Error) => ({ success: false, error: err.message }))
  if (!verify || verify.success !== true) {
    return generic()
  }

  // Find the auth_identity for this customer so we can include its id
  // in the JWT (same shape Medusa's emailpass route returns).
  const identities = await authModule
    .listAuthIdentities(
      { app_metadata: { customer_id: customer.id } },
      { take: 1 },
    )
    .catch(() => [] as any[])
  const authIdentity = identities?.[0]
  if (!authIdentity) {
    // Defensive — authenticate succeeded but no identity row found.
    // Should be impossible; log + bail.
    logger.error("phonepass: authenticate ok but no auth_identity", {
      customer_id: customer.id,
    })
    return generic()
  }

  // Mint a Medusa-format JWT identical to what the emailpass route
  // returns. The storefront stashes this in localStorage as
  // `medusa_auth_token` and includes it as `Authorization: Bearer …`
  // on every subsequent /store/me/* call.
  const config: any = req.scope.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE,
  )
  const http = config.projectConfig.http
  const token = generateJwtToken(
    {
      actor_id: customer.id,
      actor_type: "customer",
      auth_identity_id: authIdentity.id,
      app_metadata: {
        customer_id: customer.id,
      },
      user_metadata: {},
    },
    {
      secret: http.jwtSecret,
      expiresIn: http.jwtExpiresIn ?? "1d",
      jwtOptions: http.jwtOptions,
    },
  )

  return respondOk(res, { token })
}
