import { z } from "zod";

export const RBAC_SCOPES = ["admin", "b2b_company", "sales_rep"] as const;
export const RBAC_ACTOR_TYPES = ["user", "customer"] as const;

const PermissionPath = z
  .string()
  .min(1)
  .max(120)
  .regex(/^(\*|[a-z][a-z0-9_]*(\.[a-z0-9_*]+)*)$/, "must be dot-namespaced lowercase or *");

const RoleCode = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9_]+$/, "must be lowercase alphanumeric + underscore");

export const CreateRoleDto = z.object({
  code: RoleCode,
  display_name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  scope: z.enum(RBAC_SCOPES),
  is_system: z.boolean().default(false),
  active: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateRoleInput = z.infer<typeof CreateRoleDto>;

export const UpdateRoleDto = CreateRoleDto.partial().omit({ code: true });
export type UpdateRoleInput = z.infer<typeof UpdateRoleDto>;

export const ListRolesQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  scope: z.enum(RBAC_SCOPES).optional(),
  active: z.coerce.boolean().optional(),
});
export type ListRolesQuery = z.infer<typeof ListRolesQueryDto>;

export const SetRolePermissionsDto = z.object({
  permissions: z
    .array(
      z.object({
        permission: PermissionPath,
        allow: z.boolean().default(true),
      }),
    )
    .max(500),
});
export type SetRolePermissionsInput = z.infer<typeof SetRolePermissionsDto>;

export const GrantRoleDto = z.object({
  actor_type: z.enum(RBAC_ACTOR_TYPES),
  actor_id: z.string().min(1),
  role_id: z.string().min(1),
  company_id: z.string().optional(),
  expires_at: z.coerce.date().optional(),
});
export type GrantRoleInput = z.infer<typeof GrantRoleDto>;

export const ListUserRolesQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  actor_type: z.enum(RBAC_ACTOR_TYPES).optional(),
  actor_id: z.string().optional(),
  role_id: z.string().optional(),
  company_id: z.string().optional(),
});
export type ListUserRolesQuery = z.infer<typeof ListUserRolesQueryDto>;

export const CheckPermissionDto = z.object({
  actor_type: z.enum(RBAC_ACTOR_TYPES),
  actor_id: z.string().min(1),
  permission: PermissionPath,
  company_id: z.string().optional(),
});
export type CheckPermissionInput = z.infer<typeof CheckPermissionDto>;
