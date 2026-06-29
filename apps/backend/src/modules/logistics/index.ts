import { Module } from "@medusajs/framework/utils"
import LogisticsModuleService from "./service"

export const LOGISTICS_MODULE = "logistics"

export default Module(LOGISTICS_MODULE, {
  service: LogisticsModuleService,
})

export { LogisticsModuleService }
