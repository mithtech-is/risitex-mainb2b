import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  DISCOUNT_CODE_MODULE,
  type DiscountCodeModuleService,
} from "../../../../modules/discount_code"

// Soft-deactivate the PIX record. The Medusa promotion is left in place
// (its native limit still applies); deactivating here makes the code
// unresolvable by the store apply endpoint.
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve<DiscountCodeModuleService>(DISCOUNT_CODE_MODULE)
  await svc.updateDiscountCodes({ id: req.params.id, active: false })
  return res.json({ id: req.params.id, deleted: true })
}
