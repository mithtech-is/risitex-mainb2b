import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { sendEventEmail } from "../../../../modules/polemarch_communication/helpers/send-event-email"
import { logger } from "../../../../utils/logger"
import { respondOk, respondErr } from "../../../../utils/envelope"

/**
 * POST /store/me/change-password
 *
 * Authenticated password change from /dashboard/account → Section 4.
 * Spec: requires the current password (proof-of-knowledge — defends
 * against a stolen session) plus a new password (×2 in the UI; we only
 * receive the verified single value here). On success, fires
 * `auth.password_changed` so the user gets an email/WhatsApp tamper-
 * evident notice.
 *
 * Body: { current_password, new_password }
 *
 * Implementation notes:
 *   - Uses Medusa's `authModule.authenticate("emailpass", ...)` to
 *     verify the current password — single source of truth, no bcrypt
 *     dep needed.
 *   - Uses Medusa's `authModule.updateProvider("emailpass", ...)` to
 *     write the new password — Medusa handles bcrypt internally.
 *   - Notification fan-out is best-effort; the password change itself
 *     never fails because we couldn't email.
 */

const BodySchema = z.object({
  current_password: z.string().min(1, "current_password required"),
  new_password: z.string().min(8, "new password must be at least 8 characters"),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata?.customer_id as
    | string
    | undefined
  if (!customerId) {
    return respondErr(res, 401, "auth.unauthenticated", "Not authenticated")
  }

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return respondErr(
      res,
      400,
      "auth.change_password.invalid_payload",
      "Invalid payload",
      { errors: parsed.error.flatten() },
    )
  }
  const { current_password, new_password } = parsed.data

  const customerModule = req.scope.resolve(Modules.CUSTOMER) as any
  const customer = await customerModule
    .retrieveCustomer(customerId, { select: ["id", "email"] })
    .catch(() => null)
  if (!customer || !customer.email) {
    return respondErr(res, 404, "auth.change_password.customer_missing", "Customer not found")
  }

  const authModule = req.scope.resolve(Modules.AUTH) as any

  // Step 1 — verify the current password by replaying the emailpass
  // authenticate flow with the user's submitted current_password.
  // If it fails, abort before touching anything.
  const verify = await authModule
    .authenticate("emailpass", {
      url: req.url,
      headers: req.headers,
      query: req.query,
      protocol: (req as any).protocol,
      body: { email: customer.email, password: current_password },
    })
    .catch((err: Error) => ({ success: false, error: err.message }))
  if (!verify || verify.success !== true) {
    return respondErr(
      res,
      401,
      "auth.change_password.wrong_current_password",
      "Current password didn't match.",
    )
  }

  // Step 2 — write the new password via Medusa's emailpass provider.
  // updateProvider handles bcrypt + auth_identity row update.
  let updateResult: any
  try {
    updateResult = await authModule.updateProvider("emailpass", {
      email: customer.email,
      password: new_password,
      entity_id: customer.email,
    })
  } catch (err) {
    logger.error("change-password: updateProvider failed", {
      customer_id: customerId,
      error: (err as Error).message,
    })
    return respondErr(
      res,
      500,
      "auth.change_password.update_failed",
      "Couldn't update the password. Try again.",
    )
  }
  if (updateResult && updateResult.success === false) {
    return respondErr(
      res,
      400,
      "auth.change_password.update_rejected",
      updateResult.error || "Password change rejected.",
    )
  }

  // Step 3 — fire the notification (email; WhatsApp will fan-out
  // automatically once the WA event-mapping for auth.password_changed
  // is added — see handoff doc Phase C). Best-effort.
  const changedAt = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  })
  await sendEventEmail(req.scope, "auth.password_changed", {
    customer: { first_name: (customer as any).first_name ?? "", email: customer.email },
    changed_at: `${changedAt} IST`,
  })

  return respondOk(res, { ok: true })
}
