import { MedusaService } from "@medusajs/framework/utils"
import { CreditTerms } from "./models/credit-terms"

class CreditTermsModuleService extends MedusaService({
  CreditTerms,
}) {}

export default CreditTermsModuleService
