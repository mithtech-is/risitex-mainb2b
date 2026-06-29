import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { addItemsToCart } from "../../../../../../lib/cart-add"

/**
 * POST /store/b2b-sales/cart/:id/reorder   (FR-3.04 Quick Reorder)
 *
 * Body: { order_id }
 *
 * Clones every line of a past order (owned by the signed-in customer) into the
 * active cart — the one-click weekly/monthly restock. Requires auth; the order
 * must belong to the caller.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const customerId =
    (req as any).auth_context?.app_metadata?.customer_id ?? null
  if (!customerId) {
    return res.status(401).json({ message: "Sign in to reorder" })
  }

  const { order_id } = (req.body ?? {}) as { order_id?: string }
  if (!order_id) {
    return res.status(400).json({ message: "order_id is required" })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "items.variant_id", "items.quantity"],
    filters: { id: order_id },
  })
  const order = orders?.[0] as
    | {
        id: string
        customer_id: string | null
        items: { variant_id: string | null; quantity: number }[]
      }
    | undefined

  // Generic 404 (don't leak whether the order exists) when not the caller's.
  if (!order || order.customer_id !== customerId) {
    return res.status(404).json({ message: "Order not found" })
  }

  const items = (order.items ?? [])
    .filter((i) => i.variant_id)
    .map((i) => ({ variant_id: i.variant_id as string, quantity: Number(i.quantity) }))
  if (!items.length) {
    return res
      .status(400)
      .json({ message: "That order has no re-orderable items" })
  }

  const result = await addItemsToCart(req.scope, cartId, items)
  return res.json({ ok: true, from_order: order_id, ...result })
}
