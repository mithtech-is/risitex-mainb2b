import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../../../modules/purchase_order"
import { logger } from "../../../../../utils/logger"

/**
 * POST /admin/purchase-orders/:id/mark-shipped
 *
 * Admin records that the PO has been dispatched. Stamps dispatched_at,
 * tracking number, and carrier on PO metadata. The buyer's /b2b/shipments
 * page reads these fields and surfaces the row as a tracked shipment.
 *
 * Requires admin approval first (admin_approved_at must be set).
 *
 * Body:
 *   {
 *     tracking_number: string,
 *     carrier: string,
 *     notes?: string
 *   }
 */
const BodySchema = z.object({
  tracking_number: z.string().trim().min(2).max(120),
  carrier: z.string().trim().min(2).max(60),
  notes: z.string().max(2_000).optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  if (!id) return res.status(400).json({ message: "PO id required" })

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  const { tracking_number, carrier, notes } = parsed.data

  const svc = req.scope.resolve(
    PURCHASE_ORDER_MODULE,
  ) as PurchaseOrderModuleService

  try {
    const existing = await (
      svc as unknown as { retrievePurchaseOrder: (id: string) => Promise<any> }
    ).retrievePurchaseOrder(id)
    if (!existing) return res.status(404).json({ message: "PO not found" })

    const meta = (existing.metadata ?? {}) as Record<string, unknown>
    if (!meta.admin_approved_at) {
      return res.status(409).json({
        message:
          "Approve the payment first — only approved POs can be marked shipped.",
      })
    }

    const now = new Date().toISOString()
    const nextMeta = {
      ...meta,
      dispatched_at: now,
      dispatch_tracking_number: tracking_number,
      dispatch_carrier: carrier,
      ...(notes ? { dispatch_notes: notes } : {}),
    }

    await (
      svc as unknown as {
        updatePurchaseOrders: (
          rows: Array<Record<string, unknown>>,
        ) => Promise<any>
      }
    ).updatePurchaseOrders([{ id, metadata: nextMeta }])

    logger.info("PO marked shipped by admin", {
      po_id: id,
      carrier,
      tracking: tracking_number.slice(0, 8) + "…",
    })

    return res.json({
      ok: true,
      purchase_order: {
        id,
        dispatched_at: now,
        dispatch_tracking_number: tracking_number,
        dispatch_carrier: carrier,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("PO mark-shipped failed", { po_id: id, error: msg })
    return res.status(500).json({ message: msg })
  }
}
