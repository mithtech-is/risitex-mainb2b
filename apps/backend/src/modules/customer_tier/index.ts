import { Module } from "@medusajs/framework/utils"
import CustomerTierModuleService from "./service"

export const CUSTOMER_TIER_MODULE = "customer_tier"

export default Module(CUSTOMER_TIER_MODULE, {
  service: CustomerTierModuleService,
})

export { CustomerTierModuleService }
