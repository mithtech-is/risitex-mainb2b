import { Module } from "@medusajs/framework/utils";
import WarehouseModuleService from "./service";

export const WAREHOUSE_MODULE = "warehouse";

export default Module(WAREHOUSE_MODULE, {
  service: WarehouseModuleService,
});

export { default as WarehouseModuleService } from "./service";
export { WarehouseProfile } from "./models/warehouse-profile";
