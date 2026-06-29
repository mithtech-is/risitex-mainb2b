import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import {
  POLEMARCH_COMMUNICATION_MODULE,
  CommunicationModuleService,
} from "../../../../../modules/polemarch_communication"
import { respondOk, respondErr } from "../../../../../utils/envelope"
import { findConflictingPhoneCustomer } from "../../../../../utils/identity-uniqueness"

/**
 * POST /store/auth/pan-otp/verify  (FR-1.04b)
 *
 * Verifies the phone OTP issued by /store/auth/pan-otp/send and on
 * success stamps the customer with:
 *
 *   metadata.pan                   = <PAN>
 *   metadata.pan_verified          = true
 *   metadata.pan_verified_at       = <now>
 *   metadata.pan_match_verified    = false   ← set true ONLY when a real
 *                                              third-party PAN-name match
 *                                              provider (Karza / Sandbox /
 *                                              IDfy) confirms ownership.
 *   metadata.phone_verified        = true    (existing phone-OTP semantics)
 *   metadata.phone_verified_at     = <now>
 *   phone                          = <phone_e164>
 *
 * The split between `pan_verified` (= phone proves channel ownership)
 * and `pan_match_verified` (= PAN registry confirms PAN→name match)
 * lets downstream gates pick their own bar without re-engineering this
 * route when the registry provider is wired.
 */
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/

const BodySchema = z.object({
  otp_request_id: z.string().min(1),
  pan: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => PAN_REGEX.test(v), {
      message: "PAN must be a 10-character Indian PAN (e.g. AAAPL1234C)",
    }),
  phone_e164: z.string().min(8).max(20).regex(/^\+[1-9]\d{6,18}$/),
  otp: z.string().regex(/^\d{4,8}$/, "OTP must be 4–8 digits"),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return respondErr(
      res,
      400,
      "auth.pan_otp.invalid_payload",
      "Invalid payload",
      { errors: parsed.error.flatten() },
    )
  }
  const { otp_request_id, pan, phone_e164, otp } = parsed.data

  const customerId = (req as any).auth_context?.app_metadata?.customer_id as
    | string
    | undefined
  if (!customerId) {
    return respondErr(
      res,
      401,
      "auth.pan_otp.signin_required",
      "Sign in first.",
    )
  }

  const mod = req.scope.resolve(
    POLEMARCH_COMMUNICATION_MODULE,
  ) as CommunicationModuleService

  const verifyResult = await mod.verifyPhoneOtp({
    otp_request_id,
    phone_e164,
    otp,
  })
  if (!verifyResult.ok) {
    const reason =
      "reason" in verifyResult ? verifyResult.reason : "verify failed"
    const remaining =
      "remaining_attempts" in verifyResult
        ? verifyResult.remaining_attempts
        : undefined
    return respondErr(
      res,
      400,
      "auth.pan_otp.wrong_otp",
      reason,
      remaining !== undefined ? { remaining_attempts: remaining } : undefined,
    )
  }

  if (
    verifyResult.customer_id &&
    verifyResult.customer_id !== customerId
  ) {
    return respondErr(
      res,
      403,
      "auth.pan_otp.wrong_account",
      "OTP doesn't match this account.",
    )
  }

  // Race-condition guard — same logic as phone-otp/verify.
  const conflictId = await findConflictingPhoneCustomer(
    req.scope,
    phone_e164,
    customerId,
  )
  if (conflictId) {
    return respondErr(
      res,
      409,
      "auth.pan_otp.phone_taken",
      "This phone number was registered to another account between the code being sent and now. Use a different number.",
    )
  }

  const customerModule: any = req.scope.resolve(Modules.CUSTOMER)
  try {
    const existing = await customerModule.retrieveCustomer(customerId)
    const meta = (existing?.metadata ?? {}) as Record<string, unknown>
    const now = new Date().toISOString()
    await customerModule.updateCustomers(customerId, {
      phone: phone_e164,
      metadata: {
        ...meta,
        pan,
        pan_verified: true,
        pan_verified_at: now,
        // Phone-OTP proves channel ownership, NOT a PAN-registry name
        // match. Stays false until a real provider lookup runs.
        pan_match_verified:
          typeof meta.pan_match_verified === "boolean"
            ? meta.pan_match_verified
            : false,
        phone_verified: true,
        phone_verified_at: now,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[store/auth/pan-otp/verify] customer update failed:", msg)
    return respondErr(
      res,
      500,
      "auth.pan_otp.update_failed",
      "Verified, but couldn't update profile. Try again.",
    )
  }

  return respondOk(res, {
    pan_masked: `${pan.slice(0, 3)}****${pan.slice(-2)}`,
    phone_e164,
    pan_verified: true,
    phone_verified: true,
    pan_match_verified: false,
  })
}
