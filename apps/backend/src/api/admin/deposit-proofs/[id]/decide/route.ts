import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../../../../../modules/cashfree_wallet"
import { logger } from "../../../../../utils/logger"

/**
 * POST /admin/deposit-proofs/:id/decide
 *
 * Admin approves or rejects a customer-submitted deposit proof.
 * Approval credits the customer's wallet via the same `credit()`
 * helper that VBA webhooks use, so the ledger / idempotency
 * semantics are identical (kind = "manual_adjust",
 * reference_type = "manual", reference_id = <proof id>).
 *
 * Body shapes:
 *   { action: "approve", credited_amount_inr?: number, reviewer_notes?: string }
 *     - `credited_amount_inr` defaults to `claimed_amount_inr` when omitted.
 *
 *   { action: "reject", reviewer_notes: string }
 *     - `reviewer_notes` is required so the customer sees why.
 */
const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    credited_amount_inr: z.number().int().positive().optional(),
    reviewer_notes: z.string().trim().max(2000).optional().nullable(),
  }),
  z.object({
    action: z.literal("reject"),
    reviewer_notes: z.string().trim().min(1).max(2000),
  }),
])

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const userId = (req as any).auth_context?.actor_id as string | undefined
  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  const { id } = req.params
  if (!id) return res.status(400).json({ message: "deposit proof id required" })

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }

  const walletModule = req.scope.resolve(
    CASHFREE_WALLET_MODULE,
  ) as CashfreeWalletService

  const proof: any = await walletModule
    .retrieveDepositProof(id)
    .catch(() => null)
  if (!proof) {
    return res.status(404).json({ message: "Deposit proof not found" })
  }
  if (proof.status !== "pending") {
    return res.status(409).json({
      message: `This deposit was already ${proof.status}.`,
      code: "deposit_proof.already_decided",
    })
  }

  if (parsed.data.action === "reject") {
    try {
      const updated: any = await (walletModule as any).updateDepositProofs({
        id,
        status: "rejected",
        reviewer_user_id: userId,
        reviewer_notes: parsed.data.reviewer_notes,
        reviewed_at: new Date(),
      })
      return res.json({
        deposit_proof: {
          id: updated.id,
          status: updated.status,
          reviewer_notes: updated.reviewer_notes,
          reviewed_at: updated.reviewed_at,
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error"
      logger.error("[deposit-proofs:reject] update failed", { id, error: message })
      return res.status(500).json({ message: "Couldn't reject the deposit", detail: message })
    }
  }

  // approve
  const credited =
    parsed.data.credited_amount_inr ?? Number(proof.claimed_amount_inr)
  try {
    // ensureWallet covers customers who haven't initialised yet.
    await walletModule.ensureWallet(proof.customer_id).catch(() => null)

    const credit: any = await walletModule.credit({
      customer_id: proof.customer_id,
      amount_inr: credited,
      kind: "manual_adjust" as any,
      reference_type: "manual",
      reference_id: id,
      idempotency_key: `deposit_proof_${id}`,
      note: `Manual deposit approved by ${userId}`,
    })

    const updated: any = await (walletModule as any).updateDepositProofs({
      id,
      status: "approved",
      credited_amount_inr: credited,
      reviewer_user_id: userId,
      reviewer_notes: parsed.data.reviewer_notes ?? null,
      reviewed_at: new Date(),
      wallet_transaction_id: credit?.id ?? null,
    })
    return res.json({
      deposit_proof: {
        id: updated.id,
        status: updated.status,
        credited_amount_inr: updated.credited_amount_inr,
        reviewer_notes: updated.reviewer_notes,
        reviewed_at: updated.reviewed_at,
        wallet_transaction_id: updated.wallet_transaction_id,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[deposit-proofs:approve] credit failed", { id, error: message })
    return res.status(500).json({
      message: "Couldn't credit the wallet for this deposit",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
