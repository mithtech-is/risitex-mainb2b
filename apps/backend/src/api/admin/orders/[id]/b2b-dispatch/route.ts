import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../../../modules/purchase_order"
import {
  LOGISTICS_MODULE,
  LogisticsModuleService,
} from "../../../../../modules/logistics"
import { logger } from "../../../../../utils/logger"

/**
 * POST /admin/orders/:id/b2b-dispatch
 *
 * Records the transporter + tracking number for a B2B order directly
 * from the native Medusa Order details page. `:id` is the ORDER id.
 *
 * Also creates a Medusa fulfillment + ShipmentTransporter so the
 * buyer's /b2b/shipments page surfaces the shipment row.
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

    // ── Create a Medusa fulfillment so /store/shipments surfaces it ──
    let fulfillmentId: string | null = null
    try {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const fulfillmentModule = req.scope.resolve(Modules.FULFILLMENT)

      const { data: [order] = [] } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "items.id",
          "items.title",
          "items.quantity",
          "items.variant_sku",
        ],
        filters: { id: orderId },
      })

      if (order) {
        const { data: locations = [] } = await query.graph({
          entity: "stock_location",
          fields: ["id"],
          pagination: { take: 1 },
        })
        const locationId = locations[0]?.id ?? "default"

        const fulfillment = await fulfillmentModule.createFulfillment({
          provider_id: "manual_manual",
          location_id: locationId,
          shipped_at: new Date(),
          labels: tracking_number
            ? [{ tracking_number, tracking_url: "" }]
            : [],
          items: (order.items ?? []).map((item: any) => ({
            title: item.title ?? "Item",
            sku: item.variant_sku ?? "",
            quantity: item.quantity ?? 1,
            line_item_id: item.id,
          })),
          metadata: {
            transporter,
            po_id: po?.id ?? null,
          },
          order: {
            id: orderId,
            display_id: order.display_id,
          },
        })

        fulfillmentId = fulfillment.id

        const link = req.scope.resolve(ContainerRegistrationKeys.LINK)
        await link.create({
          [Modules.ORDER]: { order_id: orderId },
          [Modules.FULFILLMENT]: { fulfillment_id: fulfillment.id },
        })

        const logistics = req.scope.resolve(
          LOGISTICS_MODULE,
        ) as LogisticsModuleService
        await logistics.assignTransporter({
          shipment_id: fulfillment.id,
          transporter_code: transporter
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, ""),
          transporter_display_name: transporter,
          awb: tracking_number ?? null,
          dispatched_at: new Date(),
        })

        logger.info("Created fulfillment + transporter for order", {
          order_id: orderId,
          fulfillment_id: fulfillment.id,
        })
      }
    } catch (fulErr) {
      const fMsg = fulErr instanceof Error ? fulErr.message : String(fulErr)
      logger.warn(
        `[b2b-dispatch] fulfillment creation failed (metadata still stamped): ${fMsg}`,
        { order_id: orderId },
      )
    }

    logger.info("B2B order marked dispatched by admin", {
      order_id: orderId,
      po_id: po?.id,
      transporter,
      fulfillment_id: fulfillmentId,
    })

    return res.json({ ok: true, fulfillment_id: fulfillmentId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("b2b-dispatch failed", { order_id: orderId, error: msg })
    return res.status(500).json({ message: msg })
  }
}
