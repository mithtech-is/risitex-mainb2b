import { Module } from "@medusajs/framework/utils"
import MasterCartonModuleService from "./service"

export const MASTER_CARTON_MODULE = "master_carton"

export default Module(MASTER_CARTON_MODULE, {
  service: MasterCartonModuleService,
})

export { MasterCartonModuleService }
