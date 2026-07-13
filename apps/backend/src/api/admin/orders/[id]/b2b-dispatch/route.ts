import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../../../modules/purchase_order"
import { logger } from "../../../../../utils/logger"

/**
 * POST /admin/orders/:id/b2b-dispatch
 *
 * Records the transporter + tracking number for a B2B order directly
 * from the native Medusa Order details page. `:id` is the ORDER id.
 *
 * Body: { transporter: string (1..80), tracking_number?: string (max 120) }
 *
 * `transporter` is a free-typed carrier name (not a fixed enum — MBOs
 * use a range of regional transporters).
 */
const BodySchema = z.object({
  transporter: z.string().trim().min(1).max(80),
  tracking_number: z.string().trim().max(120).optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id: orderId } = req.params as { id: string }
  if (!orderId) return res.status(400).json({ message: "Order id required" })

  const parsed = BodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  const { transporter, tracking_number } = parsed.data

  const svc = req.scope.resolve(
    PURCHASE_ORDER_MODULE,
  ) as PurchaseOrderModuleService

  try {
    const [po] = await (
      svc as unknown as {
        listPurchaseOrders: (
          filters: Record<string, unknown>,
        ) => Promise<any[]>
      }
    ).listPurchaseOrders({ order_id: orderId })

    const now = new Date().toISOString()

    if (po) {
      const meta = (po.metadata ?? {}) as Record<string, unknown>
      const nextMeta = {
        ...meta,
        dispatched_at: now,
        dispatch_carrier: transporter,
        dispatch_tracking_number: tracking_number ?? null,
      }

      await (
        svc as unknown as {
          updatePurchaseOrders: (
            rows: Array<Record<string, unknown>>,
          ) => Promise<any>
        }
      ).updatePurchaseOrders([{ id: po.id, metadata: nextMeta }])
    } else {
      logger.warn(
        `[b2b-dispatch] no linked purchase_order found for order ${orderId} — updating order metadata only`,
      )
    }

    // Best-effort: mirror onto the order's own metadata for the widget.
    try {
      const orderModule = req.scope.resolve(Modules.ORDER)
      const order = await orderModule.retrieveOrder(orderId)
      await orderModule.updateOrders([
        {
          id: orderId,
          metadata: {
            ...(order.metadata || {}),
            b2b_dispatched_at: now,
            b2b_transporter: transporter,
            b2b_tracking: tracking_number ?? null,
          },
        },
      ])
    } catch (metaErr) {
      logger.warn(
        `[b2b-dispatch] failed to mirror dispatch onto order ${orderId} metadata: ${metaErr instanceof Error ? metaErr.message : metaErr}`,
      )
    }

    logger.info("B2B order marked dispatched by admin", {
      order_id: orderId,
      po_id: po?.id,
      transporter,
    })

    return res.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("b2b-dispatch failed", { order_id: orderId, error: msg })
    return res.status(500).json({ message: msg })
  }
}
