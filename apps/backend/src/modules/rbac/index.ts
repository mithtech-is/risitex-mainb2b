import { Module } from "@medusajs/framework/utils";
import RbacModuleService from "./service";

export const RBAC_MODULE = "rbac";

export default Module(RBAC_MODULE, {
  service: RbacModuleService,
});

export { default as RbacModuleService } from "./service";
export { Role } from "./models/role";
export { RolePermission } from "./models/role-permission";
export { UserRole } from "./models/user-role";
