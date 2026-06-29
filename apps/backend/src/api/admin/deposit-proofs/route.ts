import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../../../modules/cashfree_wallet"

/**
 * GET /admin/deposit-proofs?status=&limit=&offset=
 *
 * List customer-submitted offline-transfer proofs awaiting (or past)
 * admin review. Used by the Wallet ops console → "Deposit proofs" tab.
 *
 * `status` defaults to "pending" — newest first. "all" returns the
 * full set so ops can audit historical approvals + rejections.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const status =
    typeof req.query.status === "string" ? req.query.status : "pending"
  const limit = Math.min(
    Math.max(Number.parseInt(String(req.query.limit ?? "50"), 10) || 50, 1),
    200,
  )
  const offset = Math.max(
    Number.parseInt(String(req.query.offset ?? "0"), 10) || 0,
    0,
  )

  const walletModule = req.scope.resolve(
    CASHFREE_WALLET_MODULE,
  ) as CashfreeWalletService

  const filters: Record<string, unknown> = {}
  if (status !== "all") filters.status = status

  const [rows, count] = await walletModule.listAndCountDepositProofs(
    filters as any,
    { take: limit, skip: offset, order: { created_at: "DESC" } as any },
  )

  res.json({
    count,
    limit,
    offset,
    deposit_proofs: rows.map((r: any) => ({
      id: r.id,
      customer_id: r.customer_id,
      claimed_amount_inr: r.claimed_amount_inr,
      credited_amount_inr: r.credited_amount_inr,
      utr: r.utr,
      customer_note: r.customer_note,
      proof_file_url: r.proof_file_url,
      status: r.status,
      reviewer_user_id: r.reviewer_user_id,
      reviewer_notes: r.reviewer_notes,
      reviewed_at: r.reviewed_at,
      wallet_transaction_id: r.wallet_transaction_id,
      created_at: r.created_at,
    })),
  })
}
