import { MedusaService } from "@medusajs/framework/utils"
import { MatrixOrderSession } from "./models/matrix-order-session"

class MatrixOrderModuleService extends MedusaService({
  MatrixOrderSession,
}) {}

export default MatrixOrderModuleService
