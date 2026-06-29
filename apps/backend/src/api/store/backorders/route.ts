import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  BACKORDER_MODULE,
  BackorderModuleService,
} from "../../../modules/backorder"
import { logger } from "../../../utils/logger"

/**
 * GET /store/backorders
 *
 * Customer-scoped backorder list. We don't index BackorderRequest
 * directly by customer_id (the model keys off order_id), so we first
 * fetch the customer's order ids via Medusa native `/store/orders`
 * lookup and then resolve the backorder rows on those.
 *
 * Returns the rows newest-first with derived display fields:
 *   - product_name + sku come from the row itself (sku is stored)
 *   - status is one of pending / in_prod / fulfilled / cancelled
 *   - eta is the production team's confirmed dispatch date (may be null)
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  try {
    // First step: resolve the customer's order ids via the order
    // module. We only need ids — backorder filtering happens on order_id.
    const query = req.scope.resolve("query") as unknown as {
      graph: (q: {
        entity: string
        fields: string[]
        filters: Record<string, unknown>
        pagination?: { take?: number; skip?: number }
      }) => Promise<{ data: any[] }>
    }
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id"],
      filters: { customer_id: customerId },
      pagination: { take: 250 },
    })
    const orderIds = orders.map((o) => o.id as string)
    if (orderIds.length === 0) {
      return res.json({ backorders: [] })
    }
    const displayByOrderId = new Map<string, string | number>()
    for (const o of orders) {
      displayByOrderId.set(o.id, o.display_id)
    }

    const backorderModule = req.scope.resolve(
      BACKORDER_MODULE,
    ) as BackorderModuleService
    const [rows] = await (
      backorderModule as unknown as {
        listAndCountBackorderRequests: (
          filters: Record<string, unknown>,
          config: { take?: number; order?: Record<string, "ASC" | "DESC"> },
        ) => Promise<[any[], number]>
      }
    ).listAndCountBackorderRequests(
      { order_id: orderIds },
      { take: 200, order: { created_at: "DESC" } },
    )

    return res.json({
      backorders: rows.map((b) => ({
        id: b.id,
        order_id: b.order_id,
        order_display_id: displayByOrderId.get(b.order_id) ?? null,
        line_id: b.line_id,
        sku: b.sku,
        qty: Number(b.qty ?? 0),
        eta: b.eta,
        status: b.status,
        jira_ticket_id: b.jira_ticket_id,
        cancelled_reason: b.cancelled_reason,
        cancelled_at: b.cancelled_at,
        created_at: b.created_at,
        updated_at: b.updated_at,
        metadata: b.metadata,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/backorders] list failed", {
      customer_id: customerId,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't load backorders.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}

/**
 * POST /store/backorders   (FR-9.03 Backorder placement)
 *
 * Body: { order_id, line_id, sku, qty, eta? }
 *
 * Lets an authorised MBO place a backorder for an out-of-stock line on one of
 * their own orders. Idempotent per (order_id, line_id, sku). Emits
 * `backorder.placed` so the Jira-ticketing subscriber opens a production ticket
 * (FR-5.03).
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata?.customer_id as
    | string
    | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  const { order_id, line_id, sku, qty, eta } = (req.body ?? {}) as {
    order_id?: string
    line_id?: string
    sku?: string
    qty?: number
    eta?: string
  }
  if (!order_id || !line_id || !sku || !qty || Number(qty) <= 0) {
    return res.status(400).json({
      message: "order_id, line_id, sku and a positive qty are required",
    })
  }

  // Verify the order belongs to the caller (anti-tamper).
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { id: order_id, customer_id: customerId },
  })
  if (!orders?.length) {
    return res.status(404).json({ message: "Order not found" })
  }

  const backorderModule = req.scope.resolve(
    BACKORDER_MODULE,
  ) as BackorderModuleService

  const existing = await (backorderModule as any).listBackorderRequests({
    order_id,
    line_id,
    sku,
  })
  if (existing?.length) {
    return res.json({ backorder: existing[0], existed: true })
  }

  const [backorder] = await (backorderModule as any).createBackorderRequests([
    {
      order_id,
      line_id,
      sku,
      qty: Number(qty),
      eta: eta ? new Date(eta) : null,
      status: "pending",
    },
  ])

  // Fire-and-forget production ticket (FR-5.03).
  try {
    const eventBus = req.scope.resolve(Modules.EVENT_BUS)
    await eventBus.emit({ name: "backorder.placed", data: { id: backorder.id } })
  } catch (err) {
    logger.warn("[store/backorders] could not emit backorder.placed", {
      error: err instanceof Error ? err.message : err,
    })
  }

  return res.json({ backorder })
}
