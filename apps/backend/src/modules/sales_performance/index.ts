import { Module } from "@medusajs/framework/utils"
import SalesPerformanceModuleService from "./service"

export const SALES_PERFORMANCE_MODULE = "sales_performance"

export default Module(SALES_PERFORMANCE_MODULE, {
  service: SalesPerformanceModuleService,
})

export { SalesPerformanceModuleService }
