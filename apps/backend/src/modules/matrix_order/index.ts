import { Module } from "@medusajs/framework/utils"
import MatrixOrderModuleService from "./service"

export const MATRIX_ORDER_MODULE = "matrix_order"

export default Module(MATRIX_ORDER_MODULE, {
  service: MatrixOrderModuleService,
})

export { MatrixOrderModuleService }
