import { MedusaError, MedusaService } from "@medusajs/framework/utils";
import { Role } from "./models/role";
import { RolePermission } from "./models/role-permission";
import { UserRole } from "./models/user-role";

type ActorType = "user" | "customer";

class RbacModuleService extends MedusaService({
  Role,
  RolePermission,
  UserRole,
}) {
  /**
   * Get the full list of effective permissions for an actor.
   *
   * Returns a Set of permission strings (after wildcard expansion is checked
   * at check time, not stored expanded). Denies trump allows within a role.
   * Across roles, any allow + no global deny = grant.
   */
  async listEffectivePermissions(input: {
    actor_type: ActorType;
    actor_id: string;
    company_id?: string;
  }) {
    const now = new Date();
    const grants = await this.listUserRoles({
      actor_type: input.actor_type,
      actor_id: input.actor_id,
    });
    const liveGrants = grants.filter(
      (g) => !g.expires_at || g.expires_at > now,
    );

    const allows = new Set<string>();
    const denies = new Set<string>();

    for (const grant of liveGrants) {
      if (grant.company_id && input.company_id && grant.company_id !== input.company_id) {
        continue;
      }
      const perms = await this.listRolePermissions({ role_id: grant.role_id });
      for (const p of perms) {
        if (p.allow) {
          allows.add(p.permission);
        } else {
          denies.add(p.permission);
        }
      }
    }

    return { allows, denies };
  }

  /**
   * Check whether an actor holds a specific permission.
   *
   * Match rules:
   *   exact     — "orders.read" matches an allow of "orders.read"
   *   wildcard  — "orders.*" allow matches any "orders.<x>"
   *   admin all — "*" allow matches everything
   *
   * A deny on an exact OR wildcard pattern blocks the corresponding allow.
   */
  async hasPermission(input: {
    actor_type: ActorType;
    actor_id: string;
    permission: string;
    company_id?: string;
  }) {
    const { allows, denies } = await this.listEffectivePermissions(input);

    const matchesAny = (set: Set<string>) => {
      for (const p of set) {
        if (p === input.permission) return true;
        if (p === "*") return true;
        if (p.endsWith(".*") && input.permission.startsWith(p.slice(0, -1))) return true;
      }
      return false;
    };

    if (matchesAny(denies)) return false;
    return matchesAny(allows);
  }

  /**
   * Grant a role to an actor. Idempotent on (actor_type, actor_id, role_id, company_id).
   */
  async grantRole(input: {
    actor_type: ActorType;
    actor_id: string;
    role_id: string;
    company_id?: string;
    granted_by_user_id?: string;
    expires_at?: Date;
  }) {
    const existing = await this.listUserRoles({
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      role_id: input.role_id,
      company_id: input.company_id ?? null,
    });
    if (existing.length > 0) return existing[0];

    return this.createUserRoles({
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      role_id: input.role_id,
      company_id: input.company_id ?? null,
      granted_by_user_id: input.granted_by_user_id ?? null,
      granted_at: new Date(),
      expires_at: input.expires_at ?? null,
    });
  }

  /**
   * Revoke a specific grant.
   */
  async revokeGrant(grantId: string) {
    await this.softDeleteUserRoles([grantId]);
  }

  /**
   * Replace the full permission set of a role (atomically — old rows
   * soft-deleted, new ones created). Used by seed + admin UI.
   */
  async setRolePermissions(input: {
    role_id: string;
    permissions: Array<{ permission: string; allow?: boolean }>;
  }) {
    const existing = await this.listRolePermissions({ role_id: input.role_id });
    if (existing.length > 0) {
      await this.softDeleteRolePermissions(existing.map((p) => p.id));
    }
    const toCreate = input.permissions.map((p) => ({
      role_id: input.role_id,
      permission: p.permission,
      allow: p.allow ?? true,
    }));
    if (toCreate.length > 0) {
      await this.createRolePermissions(toCreate);
    }
    return this.listRolePermissions({ role_id: input.role_id });
  }

  /**
   * Get-or-create a role by code. Used by the seed script + integrations.
   */
  async ensureRole(input: {
    code: string;
    display_name: string;
    scope: "admin" | "b2b_company" | "sales_rep";
    description?: string;
    is_system?: boolean;
  }) {
    const existing = await this.listRoles({ code: input.code });
    if (existing.length > 0) return existing[0];
    return this.createRoles({
      code: input.code,
      display_name: input.display_name,
      description: input.description ?? null,
      scope: input.scope,
      is_system: input.is_system ?? false,
      active: true,
    });
  }
}

export default RbacModuleService;
