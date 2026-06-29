import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../modules/purchase_order"
import { logger } from "../../../utils/logger"

/**
 * GET /store/purchase-orders
 *
 * Customer-scoped list of PO documents the MBO has uploaded at
 * checkout (FR-4.03). Status is DERIVED from the linked Medusa order,
 * since the PurchaseOrder model itself has no status column:
 *
 *   - "draft"        : no order_id yet (PO uploaded, checkout still
 *                      in flight or cart abandoned)
 *   - "in_progress"  : order exists, fulfillment_status NOT "delivered"
 *                      and order.status NOT "canceled"
 *   - "fulfilled"    : order's fulfillment_status === "delivered"
 *   - "cancelled"    : underlying order is canceled
 *
 * Each row carries:
 *   - id, po_number, file_url
 *   - value_major (= value_minor / 100)
 *   - expected_payment_date, created_at
 *   - order: { id, display_id, status, payment_status, fulfillment_status }
 *     (null when status === "draft")
 *   - status (derived per the above)
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  try {
    const poModule = req.scope.resolve(
      PURCHASE_ORDER_MODULE,
    ) as PurchaseOrderModuleService

    const [rows] = await (
      poModule as unknown as {
        listAndCountPurchaseOrders: (
          filters: Record<string, unknown>,
          config?: { take?: number; order?: Record<string, "ASC" | "DESC"> },
        ) => Promise<[any[], number]>
      }
    ).listAndCountPurchaseOrders(
      { customer_id: customerId },
      { take: 200, order: { created_at: "DESC" } },
    )

    // Resolve the linked Medusa orders in one shot to derive status.
    const orderIds = (rows as Array<{ order_id: string | null }>)
      .map((r) => r.order_id)
      .filter((id): id is string => !!id)
    const orderById = new Map<
      string,
      {
        id: string
        display_id: number | string
        status: string | null
        payment_status: string | null
        fulfillment_status: string | null
      }
    >()
    if (orderIds.length > 0) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: orders } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "status",
          "payment_status",
          "fulfillment_status",
        ],
        filters: { id: orderIds },
      })
      for (const o of orders ?? []) {
        orderById.set(o.id, o)
      }
    }

    const items = (rows as any[]).map((r) => {
      const linkedOrder = r.order_id ? orderById.get(r.order_id) ?? null : null
      let status: "draft" | "in_progress" | "fulfilled" | "cancelled"
      if (!linkedOrder) {
        status = "draft"
      } else if (linkedOrder.status === "canceled") {
        status = "cancelled"
      } else if (linkedOrder.fulfillment_status === "delivered") {
        status = "fulfilled"
      } else {
        status = "in_progress"
      }
      // Buyer-side payment-confirmation flags live in metadata (see
      // /confirm-payment route). Surface them on the list so the storefront
      // doesn't need a second round-trip per row to render the badge.
      const meta = (r.metadata ?? {}) as Record<string, unknown>
      const payment_confirmed_at =
        typeof meta.payment_confirmed_at === "string"
          ? (meta.payment_confirmed_at as string)
          : null
      const payment_confirmed_method =
        typeof meta.payment_confirmed_method === "string"
          ? (meta.payment_confirmed_method as string)
          : null
      const payment_confirmed_reference =
        typeof meta.payment_confirmed_reference === "string"
          ? (meta.payment_confirmed_reference as string)
          : null
      return {
        id: r.id,
        po_number: r.po_number,
        file_url: r.file_url,
        value_major: Math.round(Number(r.value_minor ?? 0) / 100),
        currency_code: r.currency_code ?? "inr",
        expected_payment_date: r.expected_payment_date,
        created_at: r.created_at,
        updated_at: r.updated_at,
        order: linkedOrder,
        status,
        payment_confirmed_at,
        payment_confirmed_method,
        payment_confirmed_reference,
        metadata: meta,
      }
    })

    return res.json({ purchase_orders: items })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/purchase-orders] list failed", {
      customer_id: customerId,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't load purchase orders.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}

/**
 * POST /store/purchase-orders
 *
 * Creates a DRAFT PurchaseOrder (no order_id yet). Customer uploads
 * the PO PDF/image to /store/upload first to get a `file_url`, then
 * POSTs the PO metadata here. The PO sits as "draft" in the list
 * until the customer attaches it to an order at checkout.
 *
 * Body:
 *   po_number              required, 1–60 chars
 *   file_url               required, /store/upload return URL
 *   value_major            required positive integer (rupees)
 *   expected_payment_date  optional ISO date
 *   notes                  optional
 *
 * Auto-resolves company_id from the customer's company link so PO
 * attribution survives even if the customer later moves to a
 * different team.
 */

const PostBody = z.object({
  po_number: z.string().min(1).max(60),
  file_url: z.string().url().or(z.string().startsWith("/")),
  value_major: z.number().int().positive().max(100_000_000),
  expected_payment_date: z.string().datetime().optional(),
  notes: z.string().max(2_000).optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  const parsed = PostBody.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  const input = parsed.data

  try {
    // Resolve company_id so PO attribution is durable even if the
    // customer later moves between teams.
    let companyId: string | null = null
    try {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: customers } = await query.graph({
        entity: "customer",
        fields: ["id", "company_id"],
        filters: { id: customerId },
      })
      companyId = (customers?.[0]?.company_id as string | null) ?? null
    } catch {
      // ignore — company_id is best-effort
    }

    const poModule = req.scope.resolve(
      PURCHASE_ORDER_MODULE,
    ) as PurchaseOrderModuleService
    const created = await (
      poModule as unknown as {
        createPurchaseOrders: (
          input: Record<string, unknown>,
        ) => Promise<any | any[]>
      }
    ).createPurchaseOrders({
      customer_id: customerId,
      company_id: companyId,
      order_id: null,
      po_number: input.po_number.trim(),
      file_url: input.file_url,
      value_minor: input.value_major * 100,
      currency_code: "inr",
      expected_payment_date: input.expected_payment_date
        ? new Date(input.expected_payment_date)
        : null,
      metadata: input.notes ? { notes: input.notes } : null,
    })
    const row = Array.isArray(created) ? created[0] : created

    return res.status(201).json({
      purchase_order: {
        id: row.id,
        po_number: row.po_number,
        file_url: row.file_url,
        value_major: Math.round(Number(row.value_minor ?? 0) / 100),
        currency_code: row.currency_code ?? "inr",
        expected_payment_date: row.expected_payment_date,
        created_at: row.created_at,
        updated_at: row.updated_at,
        order: null,
        status: "draft" as const,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/purchase-orders] create failed", {
      customer_id: customerId,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't save the purchase order.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
