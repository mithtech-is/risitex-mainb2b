import { Module } from "@medusajs/framework/utils"
import PaymentSettingsModuleService from "./service"

export const PAYMENT_SETTINGS_MODULE = "payment_settings"

/** Canonical single-row id. */
export const SETTINGS_ID = "payment_settings"

export default Module(PAYMENT_SETTINGS_MODULE, {
  service: PaymentSettingsModuleService,
})

export { PaymentSettingsModuleService }
