import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * Phase C — backend verification gate.
 *
 * Runs AFTER `authenticate("customer", ...)`. Resolves the customer
 * from the auth context and refuses the request when either of the
 * mandatory verification flags is false:
 *
 *   metadata.email_verified === true
 *   metadata.phone_verified === true
 *
 * The storefront already redirects unverified customers to
 * /auth/verification-center after sign-up / sign-in, but a malicious
 * (or stale) client can still hit /store/checkout/* directly with the
 * raw bearer token. This gate is the authoritative server-side
 * enforcement of RISITEX's auth standard (email OTP + WhatsApp OTP).
 *
 * Response on failure (HTTP 403):
 *
 *   {
 *     code: "account_not_verified",
 *     message: "Verify your email and WhatsApp number to continue.",
 *     next: "/auth/verification-center",
 *     verification: {
 *       email_verified: boolean,
 *       phone_verified: boolean,
 *     }
 *   }
 *
 * The storefront catches the 403 and redirects to `next`. The
 * `verification` block lets the UI render which step is missing
 * without a second `/store/customers/me` round-trip.
 *
 * Failure-tolerant: if the customer lookup throws (DB hiccup, stale
 * customer id, etc) we surface a 500 — we do NOT fail open into the
 * checkout. A flaky DB blocking a few carts is much better than
 * unverified accounts placing real orders.
 */
export const requireVerifiedCustomer = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
): Promise<void> => {
  const customerId = (req as unknown as {
    auth_context?: { app_metadata?: { customer_id?: string } }
  }).auth_context?.app_metadata?.customer_id

  // Must come AFTER authenticate() — no auth context means the
  // authenticate middleware short-circuited already, but we guard
  // defensively in case the gate is wired without one.
  if (!customerId) {
    res.status(401).json({
      code: "auth.required",
      message: "Sign in to continue.",
    })
    return
  }

  const customerModule = req.scope.resolve(Modules.CUSTOMER) as unknown as {
    retrieveCustomer: (id: string) => Promise<{
      metadata?: Record<string, unknown> | null
    } | null>
  }
  let customer: { metadata?: Record<string, unknown> | null } | null
  try {
    customer = await customerModule.retrieveCustomer(customerId)
  } catch (err) {
    res.status(500).json({
      code: "verification.lookup_failed",
      message: "Couldn't verify your account state. Try again in a moment.",
    })
    return
  }
  if (!customer) {
    res.status(401).json({
      code: "auth.required",
      message: "Account not found. Sign in again.",
    })
    return
  }

  const meta = (customer.metadata ?? {}) as Record<string, unknown>
  const emailVerified = meta.email_verified === true
  const phoneVerified = meta.phone_verified === true

  if (emailVerified && phoneVerified) {
    return next()
  }

  res.status(403).json({
    code: "account_not_verified",
    message: !emailVerified && !phoneVerified
      ? "Verify your email and WhatsApp number to continue."
      : !emailVerified
        ? "Verify your email to continue."
        : "Verify your WhatsApp number to continue.",
    next: "/auth/verification-center",
    verification: {
      email_verified: emailVerified,
      phone_verified: phoneVerified,
    },
  })
}
