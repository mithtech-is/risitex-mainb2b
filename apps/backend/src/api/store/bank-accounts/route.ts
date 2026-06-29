import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createHash } from "node:crypto"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../../../modules/cashfree_wallet"
import { encryptString } from "../../../modules/cashfree_wallet/cashfree/crypto"
import { logger } from "../../../utils/logger"

/**
 * Customer-facing bank-account routes.
 *
 *   GET  /store/bank-accounts      → list + active VBA snapshot
 *   POST /store/bank-accounts      → register a new bank for the customer
 *
 * The bank-account model requires:
 *   - account_number_encrypted (text)  — we encrypt at the route boundary
 *   - account_number_last4 (text)       — for safe display
 *   - bank_hash (text)                  — sha256(IFSC|account#) for cross-
 *                                          reference with the admin
 *                                          bank-registry
 * Verification stays at "pending" — the admin / Cashfree penny-drop
 * flow flips it to "verified" downstream.
 *
 * Auth + verification are enforced by the matcher in middlewares.ts.
 */

const CreateSchema = z.object({
  account_holder_name: z
    .string()
    .trim()
    .min(2, "Account holder name is required")
    .max(120),
  account_number: z
    .string()
    .trim()
    .regex(/^[0-9]{6,20}$/, "Enter a valid bank account number"),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code"),
  bank_name: z.string().trim().min(1).max(120).optional().nullable(),
})

/** Stable hash for the (IFSC, account#) pair — same shape used by the
 *  admin bank-registry and Customer-360 reverse-lookup. */
function bankHash(ifsc: string, account_number: string): string {
  return createHash("sha256")
    .update(`${ifsc.toUpperCase()}|${account_number}`)
    .digest("hex")
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  const walletModule = req.scope.resolve(
    CASHFREE_WALLET_MODULE,
  ) as CashfreeWalletService

  try {
    const banks = await walletModule.listBankAccounts(
      { customer_id: customerId } as any,
      { take: 25, order: { created_at: "DESC" } as any },
    )

    const vbas = await walletModule
      .listCashfreeVirtualAccounts(
        { customer_id: customerId, status: "active" } as any,
        { take: 1 } as any,
      )
      .catch(() => [] as any[])
    const virtualAccount = vbas[0]
      ? {
          id: vbas[0].id,
          virtual_account_number: vbas[0].virtual_account_number,
          virtual_account_id: vbas[0].virtual_account_id ?? vbas[0].id,
          ifsc: vbas[0].ifsc,
          upi_id: vbas[0].upi_id,
          beneficiary_name: vbas[0].beneficiary_name,
          status: vbas[0].status,
        }
      : null

    return res.json({
      bank_accounts: banks.map((b: any) => ({
        id: b.id,
        customer_id: b.customer_id,
        account_holder_name: b.account_holder_name,
        account_number_last4: b.account_number_last4,
        ifsc: b.ifsc,
        bank_name: b.bank_name,
        verification_status: b.verification_status,
        is_primary: !!b.is_primary,
        created_at: b.created_at,
        updated_at: b.updated_at,
      })),
      virtual_account: virtualAccount,
    })
  } catch (err) {
    logger.error("[bank-accounts:list] failed", {
      customerId,
      error: (err as Error).message,
    })
    // Fail-soft so the wallet page renders the rest of its sections.
    return res.json({ bank_accounts: [], virtual_account: null })
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  const { account_holder_name, account_number, ifsc, bank_name } = parsed.data
  const last4 = account_number.slice(-4)

  const walletModule = req.scope.resolve(
    CASHFREE_WALLET_MODULE,
  ) as CashfreeWalletService

  // Refuse a duplicate registration for the same customer (same hash).
  // Cheap pre-flight that beats the DB-level conflict surfacing.
  const hash = bankHash(ifsc, account_number)
  try {
    const existing = await walletModule.listBankAccounts(
      { customer_id: customerId, bank_hash: hash } as any,
      { take: 1 },
    )
    if (existing.length > 0) {
      return res.status(409).json({
        message: "You've already linked this bank account.",
      })
    }
  } catch {
    // List-failure is non-fatal — continue and let the create surface
    // any DB-level conflict.
  }

  // If this is the customer's first bank, mark primary. Otherwise the
  // new one is added but the existing primary stays.
  let setPrimary = true
  try {
    const existing = await walletModule.listBankAccounts(
      { customer_id: customerId } as any,
      { take: 1 },
    )
    if (existing.length > 0) setPrimary = false
  } catch {
    // ignore — default to primary
  }

  let encrypted: string
  try {
    encrypted = encryptString(account_number)
  } catch (err) {
    logger.error("[bank-accounts:create] encryption failed", {
      customerId,
      error: (err as Error).message,
    })
    return res.status(500).json({
      message:
        "Server hasn't been configured to store sensitive data securely (AT_REST_ENCRYPTION_KEY). Contact support.",
    })
  }

  try {
    const created: any = await (walletModule as any).createBankAccounts({
      customer_id: customerId,
      account_holder_name,
      account_number_encrypted: encrypted,
      account_number_last4: last4,
      ifsc,
      bank_name: bank_name ?? null,
      bank_hash: hash,
      verification_status: "pending",
      is_primary: setPrimary,
    })
    return res.status(201).json({
      bank_account: {
        id: created.id,
        customer_id: created.customer_id,
        account_holder_name: created.account_holder_name,
        account_number_last4: created.account_number_last4,
        ifsc: created.ifsc,
        bank_name: created.bank_name,
        verification_status: created.verification_status,
        is_primary: !!created.is_primary,
        created_at: created.created_at,
        updated_at: created.updated_at,
      },
      virtual_account: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[bank-accounts:create] DB write failed", {
      customerId,
      error: message,
    })
    return res.status(500).json({
      message:
        "Couldn't save your bank account. Please try again or contact support.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
