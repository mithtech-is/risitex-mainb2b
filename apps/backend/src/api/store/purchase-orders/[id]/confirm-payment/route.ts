import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../../../modules/purchase_order"
import { logger } from "../../../../../utils/logger"

/**
 * POST /store/purchase-orders/:id/confirm-payment
 *
 * Buyer-self-service payment confirmation. The buyer asserts that they
 * have paid for the PO via their chosen method (bank transfer, wallet,
 * UPI, etc.) and supplies a reference (UTR / txn id / cheque #). This
 * route writes that proof into the PO's metadata + stamps a
 * `payment_confirmed_at` ISO timestamp.
 *
 * Status semantics (read on the list/detail endpoints):
 *   - PO without payment_confirmed_at  → "draft" (awaiting payment)
 *   - PO with    payment_confirmed_at  → "draft" status but the storefront
 *                                        shows it as "payment confirmed,
 *                                        reconciliation queued"
 *   - PO with a linked Medusa order    → real status from the order
 *
 * This explicitly does NOT fabricate a Medusa order. Real reconciliation
 * (Razorpay verify / bank statement match / wallet debit) is the
 * downstream workflow; this endpoint just records that the buyer says
 * they've paid so the UI stops showing "awaiting payment" forever.
 *
 * Body:
 *   {
 *     method: "wallet" | "razorpay" | "bank_transfer" | "cheque" |
 *             "upi" | "credit_terms" | "po_upload" | "proforma" | "other",
 *     reference: string,             // UTR / txn id / cheque # / etc.
 *     paid_at?: string (ISO date),   // when the buyer paid; defaults to now
 *     notes?: string,
 *   }
 *
 * Auth: requires the authenticated customer to own this PO row.
 *
 * Idempotent: re-confirming overwrites the previous reference + bumps
 * payment_confirmed_at. We log every attempt so finance can audit.
 */
const BodySchema = z.object({
  method: z.enum([
    "wallet",
    "razorpay",
    "bank_transfer",
    "cheque",
    "upi",
    "credit_terms",
    "po_upload",
    "proforma",
    "other",
  ]),
  reference: z.string().trim().min(2).max(120),
  paid_at: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  const { id } = req.params as { id: string }
  if (!id) {
    return res.status(400).json({ message: "PO id required" })
  }

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  const { method, reference, paid_at, notes } = parsed.data

  const svc = req.scope.resolve(
    PURCHASE_ORDER_MODULE,
  ) as PurchaseOrderModuleService

  try {
    const existing = await (
      svc as unknown as { retrievePurchaseOrder: (id: string) => Promise<any> }
    ).retrievePurchaseOrder(id)

    if (!existing) {
      return res.status(404).json({ message: "PO not found" })
    }
    // Defense-in-depth: never let a buyer write to a sibling tenant's PO.
    if (existing.customer_id !== customerId) {
      return res.status(403).json({ message: "Not your PO" })
    }
    if (existing.order_id) {
      return res.status(409).json({
        message:
          "This PO is already linked to a confirmed order — payment reconciliation runs against the order, not the draft PO.",
      })
    }

    const now = new Date().toISOString()
    const existingMeta = (existing.metadata ?? {}) as Record<string, unknown>
    const nextMeta = {
      ...existingMeta,
      payment_confirmed_at: now,
      payment_confirmed_method: method,
      payment_confirmed_reference: reference,
      payment_confirmed_paid_at: paid_at ?? now,
      ...(notes ? { payment_confirmed_notes: notes } : {}),
    }

    const updated = await (
      svc as unknown as {
        updatePurchaseOrders: (
          rows: Array<Record<string, unknown>>,
        ) => Promise<any>
      }
    ).updatePurchaseOrders([{ id, metadata: nextMeta }])

    logger.info("PO payment confirmed by buyer", {
      po_id: id,
      customer_id: customerId,
      method,
      reference: reference.slice(0, 8) + "…", // truncate for log hygiene
    })

    return res.json({
      ok: true,
      purchase_order: {
        id,
        payment_confirmed_at: now,
        payment_confirmed_method: method,
        payment_confirmed_reference: reference,
        metadata: (Array.isArray(updated) ? updated[0] : updated)?.metadata ?? nextMeta,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("PO confirm-payment failed", { po_id: id, error: msg })
    return res.status(500).json({ message: msg })
  }
}
