import { Module } from "@medusajs/framework/utils"
import CourierDeliveryModuleService from "./service"

export const COURIER_DELIVERY_MODULE = "courier_delivery"

export default Module(COURIER_DELIVERY_MODULE, {
  service: CourierDeliveryModuleService,
})

export { CourierDeliveryModuleService }
