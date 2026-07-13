// apps/backend/src/api/admin/payment-verifications/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../modules/purchase_order"

/**
 * Lists purchase orders paid by Manual UPI, newest first. `status` query
 * filters by payment_status (default: awaiting_verification). Enriches each
 * row with the linked order's display_id + the customer/company ids the PO
 * already stores.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const status = (req.query.status as string) || "awaiting_verification"
  const poModule = req.scope.resolve(
    PURCHASE_ORDER_MODULE,
  ) as PurchaseOrderModuleService & {
    listPurchaseOrders: (filters: any, config?: any) => Promise<any[]>
  }

  const rows = await poModule.listPurchaseOrders(
    {},
    { take: 300, order: { created_at: "DESC" } },
  )

  const manual = (rows as any[]).filter((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>
    return m.payment_method === "manual_upi" && (status === "all" || m.payment_status === status)
  })

  // Resolve linked order display ids in one query.
  const orderIds = manual.map((r) => r.order_id).filter(Boolean)
  const orderById = new Map<string, any>()
  if (orderIds.length) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "email"],
      filters: { id: orderIds },
    })
    for (const o of orders ?? []) orderById.set(o.id, o)
  }

  const items = manual.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, any>
    const o = r.order_id ? orderById.get(r.order_id) : null
    return {
      id: r.id,
      po_number: r.po_number,
      order_id: r.order_id,
      order_display_id: o?.display_id ?? null,
      customer_id: r.customer_id,
      company_id: r.company_id,
      email: o?.email ?? null,
      amount_major: Math.round(Number(r.value_minor ?? 0) / 100),
      upi_transaction_id: m.upi_transaction_id ?? null,
      payment_date: m.payment_date ?? null,
      remarks: m.remarks ?? null,
      screenshot_url: m.screenshot_url ?? null,
      payment_status: m.payment_status ?? null,
      created_at: r.created_at,
    }
  })

  return res.json({ payment_verifications: items })
}
