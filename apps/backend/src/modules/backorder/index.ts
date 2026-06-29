import { Module } from "@medusajs/framework/utils"
import BackorderModuleService from "./service"

export const BACKORDER_MODULE = "backorder"

export default Module(BACKORDER_MODULE, {
  service: BackorderModuleService,
})

export { BackorderModuleService }
