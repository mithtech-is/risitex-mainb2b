import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * POST /store/orders/lookup
 *
 * B2B-only authenticated order lookup. The old guest lookup accepted an
 * order number + email pair for guest checkout; RISITEX no longer supports
 * guest/consumer checkout, so this route now requires the logged-in customer
 * and only returns orders owned by that customer.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  const body = (req.body ?? {}) as { order_number?: string }
  const num = parseInt(
    String(body.order_number ?? "").replace(/[^0-9]/g, ""),
    10,
  )

  if (!num) {
    return res.status(400).json({ message: "A valid order number is required." })
  }

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "customer_id",
        "status",
        "fulfillment_status",
        "created_at",
        "metadata",
        "fulfillments.id",
        "fulfillments.packed_at",
        "fulfillments.shipped_at",
        "fulfillments.delivered_at",
        "fulfillments.canceled_at",
        "fulfillments.metadata",
        "fulfillments.labels.tracking_number",
        "fulfillments.labels.tracking_url",
      ],
      filters: { display_id: num, customer_id: customerId } as any,
    })

    const order = orders?.[0]
    if (!order) {
      return res.status(404).json({ message: "No order found." })
    }

    return res.json({
      order: {
        id: order.id,
        display_id: order.display_id,
        status: order.status,
        fulfillment_status: order.fulfillment_status,
        created_at: order.created_at,
        metadata: order.metadata ?? null,
        fulfillments: order.fulfillments ?? [],
      },
    })
  } catch {
    return res
      .status(500)
      .json({ message: "Couldn't look up that order. Try again shortly." })
  }
}
