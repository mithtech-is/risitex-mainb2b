import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { logger } from "../../../../utils/logger"
import {
    CASHFREE_WALLET_MODULE,
    CashfreeWalletService,
} from "../../../../modules/cashfree_wallet"

/**
 * Customer-facing DPDP export request endpoint.
 *
 * GET   /store/account/export — return the most recent open or
 *                                completed export request for the
 *                                logged-in customer (or null).
 * POST  /store/account/export — submit a new export request.
 *                                Refuses if there is already an open
 *                                request for this customer (the partial
 *                                unique index in the migration is the
 *                                authoritative gate; this is just the
 *                                friendly 409 message).
 *
 * Auth: customer session/bearer enforced via middleware.
 *
 * Note that this endpoint does NOT compile the export itself. That work
 * is intentionally manual on ops' side — assembling personal data across
 * 15+ tables is too easy to get wrong unsupervised. The endpoint just
 * queues the work.
 */
const BodySchema = z.object({
    customer_note: z.string().trim().max(1000).optional().or(z.literal("")),
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
        { customer_id: customerId, kind: "export" },
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
        return res
            .status(400)
            .json({ message: "Invalid input", errors: parsed.error.flatten() })
    }

    const walletModule = req.scope.resolve(
        CASHFREE_WALLET_MODULE
    ) as CashfreeWalletService

    // Resolve email — auth_context may not always carry it; fall back to
    // the customer record so the row always has a useful contact address.
    let resolvedEmail = email
    if (!resolvedEmail) {
        try {
            const customerModule = req.scope.resolve("customer") as any
            const customer = await customerModule.retrieveCustomer(customerId, {
                select: ["email"],
            })
            resolvedEmail = customer?.email ?? null
        } catch {
            /* fallthrough — DB allows NOT NULL but we've already null-checked email above */
        }
    }
    if (!resolvedEmail) {
        return res
            .status(409)
            .json({
                message:
                    "Cannot find an email on your account — please add one before requesting an export.",
            })
    }

    // Friendly pre-check: surface the already-open request so the UI can
    // explain instead of rendering a generic 500.
    const existing = await walletModule.listAccountRequests(
        { customer_id: customerId, kind: "export" },
        { take: 5, order: { created_at: "DESC" } as any }
    )
    const open = existing.find(
        (r: any) => r.status === "pending" || r.status === "in_review"
    )
    if (open) {
        return res.status(409).json({
            message: "You already have an export request in progress.",
            request: open,
        })
    }

    try {
        const row = await walletModule.createAccountRequests({
            customer_id: customerId,
            customer_email: resolvedEmail,
            kind: "export",
            status: "pending",
            customer_note: parsed.data.customer_note || null,
            source_ip: firstIp(req.headers["x-forwarded-for"]) ?? firstIp(req.ip),
        })
        const created = Array.isArray(row) ? row[0] : row
        logger.info("dpdp.account_export.requested", {
            id: (created as any)?.id,
            customer_id: customerId,
        })
        return res.status(201).json({ ok: true, request: created })
    } catch (err) {
        logger.error("dpdp.account_export.failed", {
            customer_id: customerId,
            error: (err as Error).message,
        })
        return res.status(500).json({
            message: "Could not submit your export request — please try again.",
        })
    }
}
