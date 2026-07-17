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
 * POST /admin/purchase-orders/:id/mark-shipped
 *
 * Admin records that the PO has been dispatched. Creates a Medusa
 * fulfillment on the linked order so the buyer's /b2b/shipments page
 * picks it up, and a ShipmentTransporter row with carrier/AWB detail.
 *
 * Requires admin approval first (admin_approved_at must be set).
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

    // ── Create a Medusa fulfillment so /store/shipments surfaces it ──
    let fulfillmentId: string | null = null
    if (existing.order_id) {
      try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
        const orderModule = req.scope.resolve(Modules.ORDER)
        const fulfillmentModule = req.scope.resolve(Modules.FULFILLMENT)

        // Fetch order items to include in the fulfillment
        const { data: [order] = [] } = await query.graph({
          entity: "order",
          fields: [
            "id",
            "items.id",
            "items.title",
            "items.quantity",
            "items.variant_sku",
            "shipping_methods.shipping_option_id",
          ],
          filters: { id: existing.order_id },
        })

        if (order) {
          // Find a stock location
          const { data: locations = [] } = await query.graph({
            entity: "stock_location",
            fields: ["id"],
            pagination: { take: 1 },
          })
          const locationId = locations[0]?.id ?? null

          // Create the fulfillment
          const fulfillment = await fulfillmentModule.createFulfillment({
            provider_id: "manual_manual",
            location_id: locationId ?? "default",
            shipped_at: new Date(),
            labels: [{ tracking_number, tracking_url: "" }],
            items: (order.items ?? []).map((item: any) => ({
              title: item.title ?? "Item",
              sku: item.variant_sku ?? "",
              quantity: item.quantity ?? 1,
              line_item_id: item.id,
            })),
            metadata: {
              carrier,
              po_id: id,
              ...(notes ? { notes } : {}),
            },
            order: {
              id: existing.order_id,
              display_id: order.display_id,
            },
          })

          fulfillmentId = fulfillment.id

          // Link the fulfillment to the order
          const link = req.scope.resolve(ContainerRegistrationKeys.LINK)
          await link.create({
            [Modules.ORDER]: { order_id: existing.order_id },
            [Modules.FULFILLMENT]: { fulfillment_id: fulfillment.id },
          })

          // Create ShipmentTransporter row so the carrier detail shows up
          const logistics = req.scope.resolve(
            LOGISTICS_MODULE,
          ) as LogisticsModuleService
          await logistics.assignTransporter({
            shipment_id: fulfillment.id,
            transporter_code: carrier
              .toLowerCase()
              .replace(/\s+/g, "_")
              .replace(/[^a-z0-9_]/g, ""),
            transporter_display_name: carrier,
            awb: tracking_number,
            dispatched_at: new Date(),
            notes: notes ?? null,
          })

          logger.info("Created fulfillment + transporter for PO", {
            po_id: id,
            order_id: existing.order_id,
            fulfillment_id: fulfillment.id,
          })
        }
      } catch (fulErr) {
        const fMsg = fulErr instanceof Error ? fulErr.message : String(fulErr)
        logger.warn(
          `[mark-shipped] fulfillment creation failed (PO metadata still stamped): ${fMsg}`,
          { po_id: id, order_id: existing.order_id },
        )
      }
    }

    logger.info("PO marked shipped by admin", {
      po_id: id,
      carrier,
      tracking: tracking_number.slice(0, 8) + "…",
      fulfillment_id: fulfillmentId,
    })

    return res.json({
      ok: true,
      purchase_order: {
        id,
        dispatched_at: now,
        dispatch_tracking_number: tracking_number,
        dispatch_carrier: carrier,
      },
      fulfillment_id: fulfillmentId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("PO mark-shipped failed", { po_id: id, error: msg })
    return res.status(500).json({ message: msg })
  }
}
