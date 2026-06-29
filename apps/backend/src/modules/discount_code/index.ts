import { Module } from "@medusajs/framework/utils"
import DiscountCodeModuleService from "./service"

export const DISCOUNT_CODE_MODULE = "discount_code"

export default Module(DISCOUNT_CODE_MODULE, {
  service: DiscountCodeModuleService,
})

export { DiscountCodeModuleService }
