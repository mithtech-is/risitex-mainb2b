import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { validateB2BCart } from "../../../../../../lib/b2b-cart"

/**
 * GET /store/b2b-sales/cart/:id/validate
 *
 * Returns the B2B validation status for a cart (FR-3.03) so the storefront can
 * disable checkout + show which lines violate MOQ / step / the wholesale floor
 * BEFORE the buyer pays. The same check is hard-enforced server-side on cart
 * completion (see middlewares: b2bMoqGuard on /store/carts/:id/complete).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const result = await validateB2BCart(req.scope, req.params.id)
  return res.json(result)
}
