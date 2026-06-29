import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import {
    POLEMARCH_COMMUNICATION_MODULE,
    CommunicationModuleService,
} from "../../../../../modules/polemarch_communication"
import { respondOk, respondErr } from "../../../../../utils/envelope"
import { autoApproveIfPending } from "../../../../../lib/auto-approve-application"

/**
 * POST /store/auth/email-otp/verify
 *
 * Confirms a previously-issued email OTP. The caller MUST be the same
 * authenticated customer whose session issued the OTP — verified via
 * the customer_id stamped on the OTP row.
 *
 * On success: stamps `customer.metadata.email_verified = true` and
 * `customer.metadata.email_verified_at = <now>`.
 *
 * Body: { otp_request_id, otp }
 */
const BodySchema = z.object({
    otp_request_id: z.string().min(1),
    otp: z.string().regex(/^\d{4,8}$/, "OTP must be 4–8 digits"),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) {
        return respondErr(
            res,
            400,
            "auth.email_otp.invalid_payload",
            "Invalid payload",
            { errors: parsed.error.flatten() },
        )
    }
    const { otp_request_id, otp } = parsed.data

    const customerId = (req as any).auth_context?.app_metadata
        ?.customer_id as string | undefined
    if (!customerId) {
        return respondErr(
            res,
            401,
            "auth.email_otp.signin_required",
            "Sign in first.",
        )
    }

    const customerModule: any = req.scope.resolve(Modules.CUSTOMER)
    const customer = await customerModule
        .retrieveCustomer(customerId)
        .catch(() => null)
    const email = customer?.email as string | undefined
    if (!email) {
        return respondErr(
            res,
            400,
            "auth.email_otp.no_email_on_account",
            "Your account has no email on file.",
        )
    }

    const mod = req.scope.resolve(
        POLEMARCH_COMMUNICATION_MODULE,
    ) as CommunicationModuleService

    const verifyResult = await mod.verifyEmailOtp({
        otp_request_id,
        email,
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
            "auth.email_otp.wrong_otp",
            reason,
            remaining !== undefined ? { remaining_attempts: remaining } : undefined,
        )
    }

    if (
        verifyResult.customer_id &&
        verifyResult.customer_id !== customerId
    ) {
        // Defense-in-depth — OTP was issued for a different session.
        return respondErr(
            res,
            403,
            "auth.email_otp.wrong_account",
            "OTP doesn't match this account.",
        )
    }

    try {
        const meta = (customer?.metadata ?? {}) as Record<string, unknown>
        await customerModule.updateCustomers(customerId, {
            metadata: {
                ...meta,
                email_verified: true,
                email_verified_at: new Date().toISOString(),
            },
        })
    } catch (err: any) {
        console.error(
            "[store/auth/email-otp/verify] customer update failed:",
            err,
        )
        return respondErr(
            res,
            500,
            "auth.email_otp.update_failed",
            "Verified, but couldn't update profile. Try again.",
        )
    }

    // FR-1.02b — auto-approve any pending application on email-OTP success.
    // Best-effort: a failure here keeps the email verification successful;
    // ops can still approve manually from the admin if this didn't land.
    const approval = await autoApproveIfPending(req.scope, {
        customer_id: customerId,
        email,
    })

    return respondOk(res, {
        purpose: "verify" as const,
        email,
        email_verified: true,
        b2b_approved: approval.approved || !!approval.alreadyApproved,
        company_id: approval.company_id ?? null,
        ...(approval.reason && !approval.approved
            ? { auto_approve_skipped: approval.reason }
            : {}),
    })
}
