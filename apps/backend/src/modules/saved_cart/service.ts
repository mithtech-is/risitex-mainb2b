import { MedusaService } from "@medusajs/framework/utils"
import { SavedCart } from "./models/saved-cart"

class SavedCartModuleService extends MedusaService({
  SavedCart,
}) {}

export default SavedCartModuleService
