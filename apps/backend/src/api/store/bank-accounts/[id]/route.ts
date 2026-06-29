import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../../../../modules/cashfree_wallet"
import { logger } from "../../../../utils/logger"

/**
 * Per-bank-account customer routes.
 *
 *   PATCH  /store/bank-accounts/:id   → { is_primary?, bank_name? }
 *   DELETE /store/bank-accounts/:id   → soft-remove from this customer
 *
 * The financially-sensitive fields (account_number_encrypted, ifsc,
 * verification_status) are intentionally NOT mutable from the
 * storefront. To change those a customer must delete + re-add.
 */

const PatchSchema = z.object({
  is_primary: z.boolean().optional(),
  bank_name: z.string().trim().min(1).max(120).optional().nullable(),
})

async function loadOwned(
  walletModule: CashfreeWalletService,
  id: string,
  customerId: string,
): Promise<{ id: string; customer_id: string } | null> {
  try {
    const row = await walletModule.retrieveBankAccount(id).catch(() => null)
    if (!row) return null
    if ((row as any).customer_id !== customerId) return null
    return row as any
  } catch {
    return null
  }
}

export const PATCH = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  const { id } = req.params
  if (!id) return res.status(400).json({ message: "bank id required" })

  const parsed = PatchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }

  const walletModule = req.scope.resolve(
    CASHFREE_WALLET_MODULE,
  ) as CashfreeWalletService

  const owned = await loadOwned(walletModule, id, customerId)
  if (!owned) {
    return res.status(404).json({ message: "Bank account not found" })
  }

  try {
    // Setting primary on this account must demote any other primary
    // for the same customer — at most one primary per customer.
    if (parsed.data.is_primary === true) {
      try {
        const primaries = await walletModule.listBankAccounts(
          { customer_id: customerId, is_primary: true } as any,
          { take: 10 },
        )
        for (const p of primaries) {
          if ((p as any).id === id) continue
          await (walletModule as any).updateBankAccounts({
            id: (p as any).id,
            is_primary: false,
          })
        }
      } catch (err) {
        logger.warn("[bank-accounts:patch] could not demote prior primary", {
          customerId,
          error: (err as Error).message,
        })
      }
    }

    const updated: any = await (walletModule as any).updateBankAccounts({
      id,
      ...(parsed.data.is_primary !== undefined
        ? { is_primary: parsed.data.is_primary }
        : {}),
      ...(parsed.data.bank_name !== undefined
        ? { bank_name: parsed.data.bank_name }
        : {}),
    })
    return res.json({
      bank_account: {
        id: updated.id,
        customer_id: updated.customer_id,
        account_holder_name: updated.account_holder_name,
        account_number_last4: updated.account_number_last4,
        ifsc: updated.ifsc,
        bank_name: updated.bank_name,
        verification_status: updated.verification_status,
        is_primary: !!updated.is_primary,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[bank-accounts:patch] DB write failed", {
      customerId,
      id,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't update the bank account.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  const { id } = req.params
  if (!id) return res.status(400).json({ message: "bank id required" })

  const walletModule = req.scope.resolve(
    CASHFREE_WALLET_MODULE,
  ) as CashfreeWalletService

  const owned = await loadOwned(walletModule, id, customerId)
  if (!owned) {
    return res.status(404).json({ message: "Bank account not found" })
  }

  try {
    await (walletModule as any).deleteBankAccounts([id])
    return res.json({ ok: true, id })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[bank-accounts:delete] failed", {
      customerId,
      id,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't delete the bank account.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
