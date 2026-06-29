import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../../modules/purchase_order"
import { logger } from "../../../../utils/logger"

/**
 * PATCH /store/purchase-orders/:id
 *
 * Attach a draft PO to an order (the wholesale checkout flow calls
 * this immediately after `medusa.store.cart.complete()` resolves with
 * an order id). Idempotent — re-attaching the same order is a no-op,
 * attaching a different order errors 409.
 *
 * Body: { order_id }
 *
 * Both the PO and the order have to belong to the calling customer.
 */

const PatchBody = z.object({
  order_id: z.string().min(1),
})

export const PATCH = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  const { id } = req.params as { id: string }
  if (!id) {
    return res.status(400).json({ message: "id required" })
  }
  const parsed = PatchBody.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  const { order_id: orderId } = parsed.data

  try {
    const svc = req.scope.resolve(
      PURCHASE_ORDER_MODULE,
    ) as PurchaseOrderModuleService
    const existing = await (
      svc as unknown as {
        retrievePurchaseOrder: (id: string) => Promise<{
          id: string
          customer_id: string
          order_id: string | null
        } | null>
      }
    )
      .retrievePurchaseOrder(id)
      .catch(() => null)
    if (!existing) {
      return res.status(404).json({ message: "Purchase order not found" })
    }
    if (existing.customer_id !== customerId) {
      return res.status(403).json({ message: "Not your purchase order" })
    }
    if (existing.order_id && existing.order_id !== orderId) {
      return res.status(409).json({
        message: "Purchase order is already linked to a different order",
      })
    }
    if (existing.order_id === orderId) {
      return res.json({ ok: true, idempotent: true })
    }

    // Verify the order belongs to the same customer before linking — a
    // PO can only attribute spend on its OWNER's orders, never someone
    // else's.
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "customer_id"],
      filters: { id: orderId },
    })
    const ord = orders?.[0] as { customer_id: string | null } | undefined
    if (!ord) {
      return res.status(404).json({ message: "Order not found" })
    }
    if (ord.customer_id && ord.customer_id !== customerId) {
      return res.status(403).json({ message: "Not your order" })
    }

    await (
      svc as unknown as {
        updatePurchaseOrders: (
          input: Array<Record<string, unknown>>,
        ) => Promise<any>
      }
    ).updatePurchaseOrders([{ id, order_id: orderId }])

    return res.json({ ok: true, idempotent: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/purchase-orders/:id PATCH] failed", {
      customer_id: customerId,
      id,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't attach the purchase order.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
