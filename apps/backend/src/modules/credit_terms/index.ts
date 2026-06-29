import { Module } from "@medusajs/framework/utils"
import CreditTermsModuleService from "./service"

export const CREDIT_TERMS_MODULE = "credit_terms"

export default Module(CREDIT_TERMS_MODULE, {
  service: CreditTermsModuleService,
})

export { CreditTermsModuleService }
