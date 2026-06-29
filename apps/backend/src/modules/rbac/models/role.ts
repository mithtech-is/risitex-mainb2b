import { model } from "@medusajs/framework/utils";
import { RolePermission } from "./role-permission";
import { UserRole } from "./user-role";

/**
 * RBAC role definition.
 *
 * `scope` qualifies who the role is for:
 *   admin        — Medusa admin users (staff)
 *   b2b_company  — assigned within a company context (granted with company_id)
 *   sales_rep    — sales rep specific permissions
 *
 * Permissions are namespaced dot-paths like "orders.read", "companies.approve".
 */
export const Role = model
  .define("rbac_role", {
    id: model.id({ prefix: "role" }).primaryKey(),

    code: model.text().searchable(),
    display_name: model.text(),
    description: model.text().nullable(),

    scope: model.enum(["admin", "b2b_company", "sales_rep"]),

    active: model.boolean().default(true),
    is_system: model.boolean().default(false),

    metadata: model.json().nullable(),

    permissions: model.hasMany(() => RolePermission, { mappedBy: "role" }),
    user_grants: model.hasMany(() => UserRole, { mappedBy: "role" }),
  })
  .indexes([
    { on: ["code"], unique: true, where: "deleted_at IS NULL" },
    { on: ["scope", "active"], unique: false },
  ]);
