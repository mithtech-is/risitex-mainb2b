import { Module } from "@medusajs/framework/utils"
import CompanyModuleService from "./service"

export const COMPANY_MODULE = "company"

export default Module(COMPANY_MODULE, {
  service: CompanyModuleService,
})

export { CompanyModuleService }
export type { CompanyApplicationPayload } from "./service"
export { GSTIN_REGEX } from "./service"
