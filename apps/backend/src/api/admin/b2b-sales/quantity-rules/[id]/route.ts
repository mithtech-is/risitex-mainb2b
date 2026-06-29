import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_PRICING_MODULE } from "../../../../../modules/b2b_pricing"

/** DELETE /admin/b2b-sales/quantity-rules/:id — soft-delete an MOQ/step rule. */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const svc = req.scope.resolve(B2B_PRICING_MODULE) as any
  await svc.deleteProductQuantityRules([id])
  return res.json({ id, object: "quantity_rule", deleted: true })
}
