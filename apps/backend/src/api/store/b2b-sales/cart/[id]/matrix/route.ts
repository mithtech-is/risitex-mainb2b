import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MATRIX_ORDER_MODULE } from "../../../../../../modules/matrix_order"
import {
  addItemsToCart,
  resolveSizeVariants,
  resolveGridToItems,
} from "../../../../../../lib/cart-add"

/**
 * POST /store/b2b-sales/cart/:id/matrix   (FR-3.01 Size Matrix Input)
 *
 * Body: { product_id, grid: { "<size|variant_id>": qty, ... } }
 *
 * Adds one line per non-zero grid cell across a style's size curve in a single
 * call (the "Grid/Matrix UI" backend), and persists the grid as a
 * matrix_order_session so the buyer's matrix can be re-rendered.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const { product_id, grid } = (req.body ?? {}) as {
    product_id?: string
    grid?: Record<string, unknown>
  }
  if (!product_id || !grid || typeof grid !== "object") {
    return res.status(400).json({ message: "product_id and grid are required" })
  }

  const { map } = await resolveSizeVariants(req.scope, product_id)
  const items = resolveGridToItems(grid, map)
  if (!items.length) {
    return res
      .status(400)
      .json({ message: "Grid resolved to no purchasable variants" })
  }

  const result = await addItemsToCart(req.scope, cartId, items)

  // Persist the matrix session (best-effort).
  try {
    const mx = req.scope.resolve(MATRIX_ORDER_MODULE) as any
    const existing = await mx.listMatrixOrderSessions({
      cart_id: cartId,
      product_id,
    })
    if (existing?.length) {
      await mx.updateMatrixOrderSessions([{ id: existing[0].id, grid }])
    } else {
      await mx.createMatrixOrderSessions([{ cart_id: cartId, product_id, grid }])
    }
  } catch {
    /* session is a convenience; cart add already succeeded */
  }

  return res.json({ ok: true, product_id, ...result })
}
