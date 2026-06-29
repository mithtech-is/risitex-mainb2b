import { model } from "@medusajs/framework/utils";
import { Role } from "./role";

/**
 * One permission grant on a role.
 *
 * `permission` is a dot-namespaced path: "orders.read", "orders.write",
 * "companies.approve", "wallets.credit". Wildcards are allowed at the leaf:
 * "orders.*" matches any orders.<anything>.
 *
 * `allow=false` is a DENY entry; denies trump allows for the same role.
 * (Cross-role precedence is: any allow + no deny = grant.)
 */
export const RolePermission = model
  .define("rbac_role_permission", {
    id: model.id({ prefix: "rolep" }).primaryKey(),

    permission: model.text(),
    allow: model.boolean().default(true),

    metadata: model.json().nullable(),

    role: model.belongsTo(() => Role, { mappedBy: "permissions" }),
  })
  .indexes([
    {
      on: ["role_id", "permission", "allow"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);
