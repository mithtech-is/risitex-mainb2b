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
 * POST /store/auth/phone-otp/verify
 *
 * Confirms a previously-issued phone OTP. Branches on the OTP request's
 * `purpose` (login vs verify) — we don't trust the client to declare it.
 *
 * For purpose="login":
 *   - Look up a single customer with `phone === phone_e164`.
 *   - If 0 customers: respond ok=false generically (don't leak phone
 *     existence).
 *   - If >1 customers: refuse with "use email login" — phone OTP login
 *     can't unambiguously pick a session.
 *   - Otherwise: find an existing auth_identity tied to that customer
 *     and mint a JWT against it. Return `{token, customer_id}` for the
 *     storefront to stash in localStorage.
 *
 * For purpose="verify":
 *   - Caller MUST be authenticated; the OTP request's `customer_id` MUST
 *     match the session's customer id.
 *   - Stamp `customer.phone = phone_e164` + `customer.metadata.
 *     phone_verified = true`. Bump audit.
 */
const BodySchema = z.object({
    otp_request_id: z.string().min(1),
    phone_e164: z
        .string()
        .min(8)
        .max(20)
        .regex(/^\+[1-9]\d{6,18}$/),
    otp: z.string().regex(/^\d{4,8}$/, "OTP must be 4–8 digits"),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) {
        return respondErr(
            res,
            400,
            "auth.phone_otp.invalid_payload",
            "Invalid payload",
            { errors: parsed.error.flatten() },
        )
    }
    const { otp_request_id, phone_e164, otp } = parsed.data

    const mod = req.scope.resolve(
        POLEMARCH_COMMUNICATION_MODULE,
    ) as CommunicationModuleService

    const verifyResult = await mod.verifyPhoneOtp({
        otp_request_id,
        phone_e164,
        otp,
    })
    if (!verifyResult.ok) {
        const reason = "reason" in verifyResult ? verifyResult.reason : "verify failed"
        const remaining =
            "remaining_attempts" in verifyResult
                ? verifyResult.remaining_attempts
                : undefined
        return respondErr(
            res,
            400,
            "auth.phone_otp.wrong_otp",
            reason,
            remaining !== undefined ? { remaining_attempts: remaining } : undefined,
        )
    }

    // OTP login was retired — the only supported phone-OTP flow is
    // `purpose: "verify"` (account-page phone verification + KYC
    // pre-flight). Login uses email-pass or phone-pass exclusively.
    if (verifyResult.purpose === "login") {
        return respondErr(
            res,
            410,
            "auth.phone_otp.login_removed",
            "Phone-OTP login is no longer supported. Use your password to sign in.",
        )
    }

    // purpose === "verify"
    const ctxCustomerId = (req as any).auth_context?.app_metadata
        ?.customer_id as string | undefined
    if (!ctxCustomerId) {
        return respondErr(
            res,
            401,
            "auth.phone_otp.signin_required",
            "Sign in first.",
        )
    }
    if (
        verifyResult.customer_id &&
        verifyResult.customer_id !== ctxCustomerId
    ) {
        // Defense-in-depth: the OTP was issued for a different customer.
        return respondErr(
            res,
            403,
            "auth.phone_otp.wrong_account",
            "OTP doesn't match this account.",
        )
    }

    // Race-condition guard — another customer could have grabbed this
    // phone in the gap between /send and /verify. Re-check uniqueness
    // before stamping. (The DB partial-unique index is the backstop.)
    const conflictId = await findConflictingPhoneCustomer(
        req.scope,
        phone_e164,
        ctxCustomerId,
    )
    if (conflictId) {
        return respondErr(
            res,
            409,
            "auth.phone_otp.phone_taken",
            "This phone number was registered to another account between when we sent the code and now. Try a different number.",
        )
    }

    const customerModule: any = req.scope.resolve(Modules.CUSTOMER)
    try {
        const existing = await customerModule.retrieveCustomer(ctxCustomerId)
        const meta = (existing?.metadata ?? {}) as Record<string, unknown>
        await customerModule.updateCustomers(ctxCustomerId, {
            phone: phone_e164,
            metadata: {
                ...meta,
                phone_verified: true,
                phone_verified_at: new Date().toISOString(),
            },
        })
    } catch (err: any) {
        console.error(
            "[store/auth/phone-otp/verify] customer update failed:",
            err,
        )
        return respondErr(
            res,
            500,
            "auth.phone_otp.update_failed",
            "Verified, but couldn't update profile. Try again.",
        )
    }

    return respondOk(res, { purpose: "verify" as const, phone_e164 })
}
