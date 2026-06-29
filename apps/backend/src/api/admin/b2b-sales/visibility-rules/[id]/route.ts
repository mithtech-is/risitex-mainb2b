import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_PRICING_MODULE } from "../../../../../modules/b2b_pricing"

/** DELETE /admin/b2b-sales/visibility-rules/:id — soft-delete a visibility rule. */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const svc = req.scope.resolve(B2B_PRICING_MODULE) as any
  await svc.deleteProductVisibilityRules([id])
  return res.json({ id, object: "visibility_rule", deleted: true })
}
