import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../../../modules/purchase_order"
import { logger } from "../../../../../utils/logger"

/**
 * POST /admin/purchase-orders/:id/approve-payment
 *
 * Admin acknowledges the buyer's payment proof. This is the gate that
 * promotes a PO from "payment recorded — awaiting approval" to
 * "approved — ready for dispatch". Once approved, the buyer's
 * /b2b/shipments and /b2b/invoices surface this PO as a tracked
 * shipment / issuable invoice respectively.
 *
 * We deliberately don't create a Medusa order from the PO here — the
 * full sales-order chain (inventory reservation, tax recalc, fulfillment
 * provider attach) is the next backend phase. For now, stamping
 * admin_approved_at on the PO metadata is enough to unblock the buyer's
 * tracking views.
 *
 * Body:
 *   { notes?: string }   // optional reviewer note for audit log
 */
const BodySchema = z.object({
  notes: z.string().max(2_000).optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  if (!id) return res.status(400).json({ message: "PO id required" })

  const parsed = BodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  const { notes } = parsed.data

  // Admin identity — Medusa admin routes attach the actor on req.user.
  const actorId =
    (req as any).user?.id ??
    (req as any).auth_context?.actor_id ??
    null
  const actorName =
    (req as any).user?.email ??
    (req as any).user?.first_name ??
    (req as any).auth_context?.actor_name ??
    "admin"

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
    const meta = (existing.metadata ?? {}) as Record<string, unknown>
    if (!meta.payment_confirmed_at) {
      return res.status(409).json({
        message:
          "This PO has no buyer-recorded payment proof yet — ask the buyer to record payment from their PO detail page before approving.",
      })
    }
    if (meta.admin_approved_at) {
      return res.status(409).json({
        message: "This PO has already been approved.",
        approved_at: meta.admin_approved_at,
      })
    }

    const now = new Date().toISOString()
    const nextMeta = {
      ...meta,
      admin_approved_at: now,
      admin_approved_by_id: actorId,
      admin_approved_by_name: actorName,
      ...(notes ? { admin_approval_notes: notes } : {}),
    }

    await (
      svc as unknown as {
        updatePurchaseOrders: (
          rows: Array<Record<string, unknown>>,
        ) => Promise<any>
      }
    ).updatePurchaseOrders([{ id, metadata: nextMeta }])

    logger.info("PO payment approved by admin", {
      po_id: id,
      actor: actorName,
    })

    return res.json({
      ok: true,
      purchase_order: {
        id,
        admin_approved_at: now,
        admin_approved_by_name: actorName,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("PO admin approve-payment failed", { po_id: id, error: msg })
    return res.status(500).json({ message: msg })
  }
}
