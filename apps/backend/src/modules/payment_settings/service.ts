import { MedusaService } from "@medusajs/framework/utils"
import { PaymentSetting } from "./models/payment-setting"

class PaymentSettingsModuleService extends MedusaService({
  PaymentSetting,
}) {}

export default PaymentSettingsModuleService
