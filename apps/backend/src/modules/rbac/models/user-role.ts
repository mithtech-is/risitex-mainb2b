import { model } from "@medusajs/framework/utils";
import { Role } from "./role";

/**
 * Grant a role to a Medusa user or customer.
 *
 * `actor_type` distinguishes Medusa's two principal types:
 *   user     — admin / staff (Medusa's user.user table)
   *   customer — B2B end users (Medusa's customer.customer table)
 *
 * `company_id` is the optional scope qualifier for b2b_company-scoped roles:
 * "Manoj is a company_admin OF company comp_abc". A role grant without
 * company_id is a global grant (admin scope).
 *
 * Unique (actor_type, actor_id, role_id, company_id) — repeated grants are
 * no-ops (the seed + admin UI can both call grantRole safely).
 */
export const UserRole = model
  .define("rbac_user_role", {
    id: model.id({ prefix: "ugrnt" }).primaryKey(),

    actor_type: model.enum(["user", "customer"]),
    actor_id: model.text(),

    company_id: model.text().nullable(),

    granted_by_user_id: model.text().nullable(),
    granted_at: model.dateTime(),
    expires_at: model.dateTime().nullable(),

    metadata: model.json().nullable(),

    role: model.belongsTo(() => Role, { mappedBy: "user_grants" }),
  })
  .indexes([
    {
      on: ["actor_type", "actor_id", "role_id", "company_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { on: ["actor_type", "actor_id"], unique: false },
    { on: ["company_id"], unique: false, where: "company_id IS NOT NULL" },
  ]);
