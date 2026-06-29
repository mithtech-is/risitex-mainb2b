import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { logger } from "../../../../utils/logger"
import {
    CASHFREE_WALLET_MODULE,
    CashfreeWalletService,
} from "../../../../modules/cashfree_wallet"

/**
 * Customer-facing DPDP deletion request endpoint.
 *
 * GET   /store/account/delete — return the customer's most recent
 *                                deletion requests (open or closed)
 *                                so the UI can show in-progress state.
 * POST  /store/account/delete — submit a new deletion request.
 *                                Refuses if the customer has live
 *                                obligations (held orders, non-zero
 *                                wallet balance) or if there is already
 *                                an open request.
 *
 * Auth: customer session/bearer enforced via middleware.
 *
 * Like the export endpoint, this only QUEUES the request. Actual data
 * erasure is performed by ops once they've confirmed (a) no live
 * obligations remain, (b) regulatory retention windows allow it.
 * Some rows are tombstoned rather than purged (KYC audit logs, payment
 * records) per the DPDP retention table in `/privacy`.
 */
const BodySchema = z.object({
    customer_note: z.string().trim().max(2000).optional().or(z.literal("")),
    /** Customer must affirmatively type "DELETE" to proceed. */
    confirm: z.literal("DELETE"),
})

function firstIp(value: unknown): string | null {
    if (typeof value !== "string") return null
    return value.split(",")[0]?.trim().slice(0, 64) || null
}

function getCustomerContext(req: MedusaRequest) {
    const customerId =
        ((req as any).auth_context?.app_metadata?.customer_id as string | undefined) ??
        null
    const email =
        ((req as any).auth_context?.app_metadata?.email as string | undefined) ?? null
    return { customerId, email }
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    const { customerId } = getCustomerContext(req)
    if (!customerId) {
        return res.status(401).json({ message: "Authentication required" })
    }

    const walletModule = req.scope.resolve(
        CASHFREE_WALLET_MODULE
    ) as CashfreeWalletService

    const rows = await walletModule.listAccountRequests(
        { customer_id: customerId, kind: "delete" },
        { take: 5, order: { created_at: "DESC" } as any }
    )
    res.json({ requests: rows })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const { customerId, email } = getCustomerContext(req)
    if (!customerId) {
        return res.status(401).json({ message: "Authentication required" })
    }

    const parsed = BodySchema.safeParse(req.body ?? {})
    if (!parsed.success) {
        return res.status(400).json({
            message: "Type DELETE in the confirmation box to proceed.",
            errors: parsed.error.flatten(),
        })
    }

    const walletModule = req.scope.resolve(
        CASHFREE_WALLET_MODULE
    ) as CashfreeWalletService

    // Resolve email so the row always has a contact address even if
    // auth_context didn't carry it.
    let resolvedEmail = email
    if (!resolvedEmail) {
        try {
            const customerModule = req.scope.resolve("customer") as any
            const customer = await customerModule.retrieveCustomer(customerId, {
                select: ["email"],
            })
            resolvedEmail = customer?.email ?? null
        } catch {
            /* fallthrough */
        }
    }

    // Pre-check: live obligations must be cleared before a deletion
    // request is even queued. This keeps ops from having to bounce
    // requests back manually.
    try {
        const wallets = await walletModule.listWallets(
            { customer_id: customerId },
            { take: 1 }
        )
        const wallet = (wallets as any[])[0] ?? null
        const balancePaise = wallet ? Number(wallet.balance_inr_paise ?? 0) : 0
        if (balancePaise > 0) {
            return res.status(409).json({
                message:
                    "Withdraw your wallet balance before deleting your account. Visit Wallet → Withdraw.",
                code: "wallet_balance_present",
            })
        }
    } catch {
        // Wallet lookup failure is non-fatal — ops will catch it.
    }

    try {
        const heldOrders = await walletModule.listHeldOrders(
            { customer_id: customerId, status: "held" },
            { take: 1 }
        )
        if ((heldOrders as any[]).length > 0) {
            return res.status(409).json({
                message:
                    "You have held orders awaiting fulfilment. Resolve those first or contact support.",
                code: "held_orders_present",
            })
        }
    } catch {
        // listHeldOrders may not exist with that filter shape on every
        // version; non-fatal — ops will see it during review.
    }

    // Friendly pre-check for an already-open request.
    const existing = await walletModule.listAccountRequests(
        { customer_id: customerId, kind: "delete" },
        { take: 5, order: { created_at: "DESC" } as any }
    )
    const open = existing.find(
        (r: any) => r.status === "pending" || r.status === "in_review"
    )
    if (open) {
        return res.status(409).json({
            message: "You already have a deletion request in progress.",
            request: open,
        })
    }

    try {
        const row = await walletModule.createAccountRequests({
            customer_id: customerId,
            customer_email: resolvedEmail ?? "unknown@unknown",
            kind: "delete",
            status: "pending",
            customer_note: parsed.data.customer_note || null,
            source_ip: firstIp(req.headers["x-forwarded-for"]) ?? firstIp(req.ip),
        })
        const created = Array.isArray(row) ? row[0] : row
        logger.info("dpdp.account_delete.requested", {
            id: (created as any)?.id,
            customer_id: customerId,
        })
        return res.status(201).json({ ok: true, request: created })
    } catch (err) {
        logger.error("dpdp.account_delete.failed", {
            customer_id: customerId,
            error: (err as Error).message,
        })
        return res.status(500).json({
            message: "Could not submit your deletion request — please try again.",
        })
    }
}
