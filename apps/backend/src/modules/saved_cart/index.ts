import { Module } from "@medusajs/framework/utils"
import SavedCartModuleService from "./service"

export const SAVED_CART_MODULE = "saved_cart"

export default Module(SAVED_CART_MODULE, {
  service: SavedCartModuleService,
})

export { SavedCartModuleService }
