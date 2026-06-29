import { MedusaService } from "@medusajs/framework/utils"
import { MasterCarton } from "./models/master-carton"

class MasterCartonModuleService extends MedusaService({
  MasterCarton,
}) {}

export default MasterCartonModuleService
