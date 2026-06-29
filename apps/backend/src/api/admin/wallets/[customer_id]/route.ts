import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../../../../modules/cashfree_wallet"
import { logger } from "../../../../utils/logger"

/**
 * GET /admin/wallets/:customer_id
 *
 * Single-call snapshot used by both the standalone Wallets page
 * (Customer wallet tab) and the Customer 360 Wallet tab. Returns
 * a FLAT shape (balance + transactions at root) so the admin UIs
 * can render without remapping.
 *
 * Equity-era pieces (KYC status, demat list, bank list with
 * verification_status etc.) are intentionally omitted — those
 * tables don't exist after the polemarch-purge migration, and
 * trying to read them crashed the Promise.all and broke the
 * Customer 360 Wallet tab with a silent error.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { customer_id } = req.params
  if (!customer_id) {
    return res.status(400).json({ message: "customer_id required" })
  }

  const walletModule = req.scope.resolve(
    CASHFREE_WALLET_MODULE,
  ) as CashfreeWalletService

  try {
    const summary = await walletModule.getWalletSummary(customer_id as string)
    const [transactions] = await walletModule.listAndCountWalletTransactions(
      { customer_id } as any,
      { take: 100, order: { created_at: "DESC" } as any },
    )

    return res.json({
      // Root fields the Customer 360 + Wallets page expect.
      balance_inr: Number(summary.balance_inr ?? 0),
      promo_balance_inr: Number(summary.promo_balance_inr ?? 0),
      is_frozen: summary.status === "frozen",
      status: summary.status,
      virtual_accounts: (summary as { virtual_accounts?: unknown[] })
        .virtual_accounts ?? [],
      transactions: transactions.map((t: any) => ({
        id: t.id,
        direction: t.direction,
        amount_inr: Number(t.amount_inr ?? 0),
        balance_after: Number(t.balance_after ?? 0),
        kind: t.kind,
        bucket: t.bucket ?? "main",
        reference_type: t.reference_type,
        reference_id: t.reference_id,
        note: t.note,
        metadata: t.metadata,
        created_at: t.created_at,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[admin/wallets/:customer_id] load failed", {
      customer_id,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't load the wallet for this customer.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
