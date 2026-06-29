import { MedusaService } from "@medusajs/framework/utils"
import { PurchaseOrder } from "./models/purchase-order"

class PurchaseOrderModuleService extends MedusaService({
  PurchaseOrder,
}) {}

export default PurchaseOrderModuleService
