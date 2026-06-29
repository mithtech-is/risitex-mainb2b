import { MedusaService } from "@medusajs/framework/utils"
import { BackorderRequest } from "./models/backorder-request"

class BackorderModuleService extends MedusaService({
  BackorderRequest,
}) {}

export default BackorderModuleService
