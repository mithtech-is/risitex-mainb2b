import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MASTER_CARTON_MODULE } from "../../../../../../modules/master_carton"
import {
  addItemsToCart,
  resolveSizeVariants,
  resolveGridToItems,
} from "../../../../../../lib/cart-add"

/**
 * POST /store/b2b-sales/cart/:id/master-carton   (FR-3.02 Master Carton)
 *
 * Body: { product_id, master_carton_id, multiplier? }
 *
 * Single-click add of a predefined master carton: expands the carton's
 * size_ratio (e.g. {S:6, M:14, L:14, XL:6}) into line items for the product,
 * optionally ×multiplier (add N cartons at once).
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const { product_id, master_carton_id, multiplier } = (req.body ?? {}) as {
    product_id?: string
    master_carton_id?: string
    multiplier?: number
  }
  if (!product_id || !master_carton_id) {
    return res
      .status(400)
      .json({ message: "product_id and master_carton_id are required" })
  }

  const mc = req.scope.resolve(MASTER_CARTON_MODULE) as any
  const carton = await mc.retrieveMasterCarton(master_carton_id).catch(() => null)
  if (!carton) {
    return res.status(404).json({ message: "Master carton not found" })
  }

  const { map } = await resolveSizeVariants(req.scope, product_id)
  const items = resolveGridToItems(
    carton.size_ratio ?? {},
    map,
    Number(multiplier) || 1,
  )
  if (!items.length) {
    return res.status(400).json({
      message: "Carton ratio resolved to no purchasable variants for this product",
    })
  }

  const result = await addItemsToCart(req.scope, cartId, items)
  return res.json({
    ok: true,
    carton: carton.name,
    cartons_added: Number(multiplier) || 1,
    ...result,
  })
}
