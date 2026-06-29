import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { logger } from "../../../../../utils/logger"
import {
    CASHFREE_WALLET_MODULE,
    CashfreeWalletService,
} from "../../../../../modules/cashfree_wallet"

/**
 * POST /store/account/:id/cancel
 *
 * Lets a customer withdraw their own DPDP export-or-delete request
 * before ops has acted on it. Only `pending` rows are cancellable —
 * once ops has marked the request `in_review` or actioned it, the
 * customer needs to email grievance@risitex.com to back out.
 *
 * Auth: customer session/bearer enforced via middleware. We additionally
 * verify the row's `customer_id` matches the authenticated caller so a
 * leaked request id can't be used cross-account.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const customerId =
        ((req as any).auth_context?.app_metadata?.customer_id as string | undefined) ??
        null
    if (!customerId) {
        return res.status(401).json({ message: "Authentication required" })
    }

    const id = req.params.id
    if (!id) return res.status(400).json({ message: "Missing request id" })

    const walletModule = req.scope.resolve(
        CASHFREE_WALLET_MODULE
    ) as CashfreeWalletService

    let row: any
    try {
        row = await walletModule.retrieveAccountRequest(id)
    } catch {
        return res.status(404).json({ message: "Request not found" })
    }

    if (row.customer_id !== customerId) {
        // Same response shape as 404 to avoid leaking ownership of foreign rows.
        return res.status(404).json({ message: "Request not found" })
    }

    if (row.status !== "pending") {
        return res.status(409).json({
            message:
                "This request is already being processed. Email grievance@risitex.com to withdraw.",
            code: "not_cancellable",
        })
    }

    try {
        await walletModule.updateAccountRequests({
            id,
            status: "cancelled",
            reviewed_at: new Date(),
        })
        logger.info("dpdp.account_request.cancelled_by_customer", {
            id,
            kind: row.kind,
            customer_id: customerId,
        })
        return res.json({ ok: true })
    } catch (err) {
        logger.error("dpdp.account_request.cancel_failed", {
            id,
            error: (err as Error).message,
        })
        return res
            .status(500)
            .json({ message: "Could not cancel — please try again." })
    }
}
