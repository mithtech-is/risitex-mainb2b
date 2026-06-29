import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../modules/purchase_order"
import { logger } from "../../../utils/logger"

/**
 * GET /admin/purchase-orders?awaiting_approval=&limit=&offset=
 *
 * Admin-side list of all customer purchase orders, with optional filter
 * for the most common ops workflow: "POs where the buyer has recorded
 * payment proof but I haven't approved them yet."
 *
 * `awaiting_approval=true` → has payment_confirmed_at AND no admin_approved_at
 *                            AND no linked order_id (i.e. still a draft PO,
 *                            buyer says they paid, admin hasn't acknowledged).
 * `awaiting_approval=all`  → return everything (default), newest first.
 *
 * Each row carries the same customer-visible fields PLUS the admin-only
 * metadata (admin_approved_at, admin_approved_by_name, dispatch info)
 * needed to render the approvals queue.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const awaitingApproval =
    String(req.query.awaiting_approval ?? "") === "true"
  const limit = Math.min(
    Math.max(Number.parseInt(String(req.query.limit ?? "100"), 10) || 100, 1),
    500,
  )
  const offset = Math.max(
    Number.parseInt(String(req.query.offset ?? "0"), 10) || 0,
    0,
  )

  try {
    const poModule = req.scope.resolve(
      PURCHASE_ORDER_MODULE,
    ) as PurchaseOrderModuleService

    const [rows, total] = await (
      poModule as unknown as {
        listAndCountPurchaseOrders: (
          filters: Record<string, unknown>,
          config?: { take?: number; skip?: number; order?: Record<string, "ASC" | "DESC"> },
        ) => Promise<[any[], number]>
      }
    ).listAndCountPurchaseOrders(
      {}, // we filter on metadata client-side because metadata is JSONB
      { take: limit, skip: offset, order: { created_at: "DESC" } },
    )

    // Enrich with customer info so the admin doesn't have to click into
    // each PO to know who placed it.
    const customerIds = Array.from(
      new Set(
        (rows as Array<{ customer_id: string | null }>)
          .map((r) => r.customer_id)
          .filter((id): id is string => !!id),
      ),
    )
    const customerById = new Map<
      string,
      { id: string; email?: string | null; first_name?: string | null; last_name?: string | null; company_id?: string | null }
    >()
    if (customerIds.length > 0) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: customers } = await query.graph({
        entity: "customer",
        fields: ["id", "email", "first_name", "last_name", "company_id"],
        filters: { id: customerIds },
      })
      for (const c of customers ?? []) customerById.set(c.id, c as any)
    }

    let items = (rows as any[]).map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>
      const c = r.customer_id ? customerById.get(r.customer_id) ?? null : null
      return {
        id: r.id,
        po_number: r.po_number,
        file_url: r.file_url,
        value_major: Math.round(Number(r.value_minor ?? 0) / 100),
        currency_code: r.currency_code ?? "inr",
        created_at: r.created_at,
        order_id: r.order_id,
        customer: c
          ? {
              id: c.id,
              email: c.email,
              name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
            }
          : null,
        payment_confirmed_at:
          typeof meta.payment_confirmed_at === "string"
            ? (meta.payment_confirmed_at as string)
            : null,
        payment_confirmed_method:
          typeof meta.payment_confirmed_method === "string"
            ? (meta.payment_confirmed_method as string)
            : null,
        payment_confirmed_reference:
          typeof meta.payment_confirmed_reference === "string"
            ? (meta.payment_confirmed_reference as string)
            : null,
        admin_approved_at:
          typeof meta.admin_approved_at === "string"
            ? (meta.admin_approved_at as string)
            : null,
        admin_approved_by_name:
          typeof meta.admin_approved_by_name === "string"
            ? (meta.admin_approved_by_name as string)
            : null,
        admin_approval_notes:
          typeof meta.admin_approval_notes === "string"
            ? (meta.admin_approval_notes as string)
            : null,
        dispatched_at:
          typeof meta.dispatched_at === "string"
            ? (meta.dispatched_at as string)
            : null,
        dispatch_tracking_number:
          typeof meta.dispatch_tracking_number === "string"
            ? (meta.dispatch_tracking_number as string)
            : null,
        dispatch_carrier:
          typeof meta.dispatch_carrier === "string"
            ? (meta.dispatch_carrier as string)
            : null,
        metadata: meta,
      }
    })

    if (awaitingApproval) {
      items = items.filter(
        (r) =>
          !!r.payment_confirmed_at &&
          !r.admin_approved_at &&
          !r.order_id,
      )
    }

    return res.json({
      count: awaitingApproval ? items.length : total,
      limit,
      offset,
      purchase_orders: items,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error"
    logger.error("[admin/purchase-orders] list failed", { error: msg })
    return res.status(500).json({
      message: "Couldn't load purchase orders.",
      detail: process.env.NODE_ENV !== "production" ? msg : undefined,
    })
  }
}
