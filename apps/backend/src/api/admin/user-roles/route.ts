import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import type { z } from "zod";
import type { GrantRoleDto, ListUserRolesQueryDto } from "../../validators/rbac";
import { RBAC_MODULE } from "../../../modules/rbac";
import type RbacModuleService from "../../../modules/rbac/service";

type Body = z.infer<typeof GrantRoleDto>;
type Query = z.infer<typeof ListUserRolesQueryDto>;

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  const ctx = (req as { auth_context?: { actor_id?: string } }).auth_context;
  const grant = await svc.grantRole({
    ...req.validatedBody,
    granted_by_user_id: ctx?.actor_id,
  });
  res.status(201).json({ grant });
};

export const GET = async (req: MedusaRequest<unknown, Query>, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  const { limit, offset, ...filters } = req.validatedQuery;
  const [grants, count] = await svc.listAndCountUserRoles(filters, {
    take: limit,
    skip: offset,
    order: { granted_at: "DESC" },
  });
  res.json({ grants, count, limit, offset });
};
