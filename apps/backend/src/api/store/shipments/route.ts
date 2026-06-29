import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  LOGISTICS_MODULE,
  LogisticsModuleService,
} from "../../../modules/logistics"
import { logger } from "../../../utils/logger"

/**
 * GET /store/shipments
 *
 * Returns one row per fulfillment across the authenticated customer's
 * orders, joined with the ShipmentTransporter row when one exists.
 *
 * Each row carries:
 *   - fulfillment_id, order_id, order_display_id
 *   - shipped_at, delivered_at, canceled_at (Medusa fulfillment)
 *   - awb        (logistics → transporter or fallback to label tracking)
 *   - transporter (transporter_code, transporter_display_name, vehicle_number)
 *   - destination (city, province, postal_code from shipping_address)
 *   - status     (derived: delivered / in_transit / label_generated /
 *                           canceled)
 *
 * The /b2b/shipments page uses this in place of the previous
 * client-side "project from /store/orders" derivation — the join
 * with ShipmentTransporter has to happen server-side because the
 * customer-facing /store/* surface doesn't expose the logistics
 * module otherwise.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "created_at",
        "shipping_address.city",
        "shipping_address.province",
        "shipping_address.postal_code",
        "shipping_address.country_code",
        "fulfillments.id",
        "fulfillments.provider_id",
        "fulfillments.shipped_at",
        "fulfillments.delivered_at",
        "fulfillments.canceled_at",
        "fulfillments.labels.tracking_number",
      ],
      filters: { customer_id: customerId },
      pagination: { take: 200 },
    })

    type Ful = {
      id: string
      provider_id?: string | null
      shipped_at?: string | null
      delivered_at?: string | null
      canceled_at?: string | null
      labels?: Array<{ tracking_number?: string | null }> | null
    }
    type Ord = {
      id: string
      display_id: number | string
      created_at: string
      shipping_address?: {
        city?: string | null
        province?: string | null
        postal_code?: string | null
        country_code?: string | null
      } | null
      fulfillments?: Ful[] | null
    }
    const orderRows = (orders ?? []) as Ord[]

    // Collect all fulfillment ids so we can do one bulk transporter
    // lookup rather than N round-trips.
    const fulfillmentIds: string[] = []
    for (const o of orderRows) {
      for (const f of o.fulfillments ?? []) {
        fulfillmentIds.push(f.id)
      }
    }

    let transporterByShipment = new Map<string, any>()
    if (fulfillmentIds.length > 0) {
      const logistics = req.scope.resolve(
        LOGISTICS_MODULE,
      ) as LogisticsModuleService
      const trans = await (
        logistics as unknown as {
          listShipmentTransporters: (
            filters: Record<string, unknown>,
            config?: { take?: number },
          ) => Promise<any[]>
        }
      ).listShipmentTransporters(
        { shipment_id: fulfillmentIds },
        { take: 500 },
      )
      transporterByShipment = new Map(
        (trans ?? []).map((t) => [t.shipment_id as string, t]),
      )
    }

    const out: Array<Record<string, unknown>> = []
    for (const o of orderRows) {
      const dest = [
        o.shipping_address?.city,
        o.shipping_address?.province,
        o.shipping_address?.postal_code,
      ]
        .filter(Boolean)
        .join(", ")
      for (const f of o.fulfillments ?? []) {
        const t = transporterByShipment.get(f.id) ?? null
        const awb =
          (t?.awb as string | null) ??
          (f.labels?.find((l) => l?.tracking_number)?.tracking_number ?? null)
        const status: string = f.canceled_at
          ? "canceled"
          : f.delivered_at
            ? "delivered"
            : f.shipped_at
              ? "in_transit"
              : "label_generated"
        out.push({
          fulfillment_id: f.id,
          order_id: o.id,
          order_display_id: o.display_id,
          destination: dest || null,
          country_code: o.shipping_address?.country_code ?? null,
          shipped_at: f.shipped_at ?? null,
          delivered_at: f.delivered_at ?? null,
          canceled_at: f.canceled_at ?? null,
          provider_id: f.provider_id ?? null,
          awb,
          status,
          transporter: t
            ? {
                code: t.transporter_code as string,
                display_name:
                  (t.transporter_display_name as string | null) ?? null,
                vehicle_number:
                  (t.vehicle_number as string | null) ?? null,
                dispatched_at: t.dispatched_at ?? null,
                notes: (t.notes as string | null) ?? null,
                // FR-5.02 live carrier tracking (cached by the courier-poll job)
                live_status: (t.live_status as string | null) ?? null,
                live_status_event:
                  (t.live_status_event as string | null) ?? null,
                live_status_at: t.live_status_at ?? null,
              }
            : null,
        })
      }
    }

    // Newest first by shipped_at or delivered_at.
    out.sort((a, b) => {
      const aT =
        new Date(
          (a.shipped_at as string | null) ??
            (a.delivered_at as string | null) ??
            0,
        ).getTime()
      const bT =
        new Date(
          (b.shipped_at as string | null) ??
            (b.delivered_at as string | null) ??
            0,
        ).getTime()
      return bT - aT
    })

    return res.json({ shipments: out })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/shipments] list failed", {
      customer_id: customerId,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't load shipments.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
