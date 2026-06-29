import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import type { z } from "zod";
import type { CreateRoleDto, ListRolesQueryDto } from "../../validators/rbac";
import { RBAC_MODULE } from "../../../modules/rbac";
import type RbacModuleService from "../../../modules/rbac/service";

type Body = z.infer<typeof CreateRoleDto>;
type Query = z.infer<typeof ListRolesQueryDto>;

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  const role = await svc.ensureRole({
    code: req.validatedBody.code,
    display_name: req.validatedBody.display_name,
    scope: req.validatedBody.scope,
    description: req.validatedBody.description,
    is_system: req.validatedBody.is_system,
  });
  res.status(201).json({ role });
};

export const GET = async (req: MedusaRequest<unknown, Query>, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  const { limit, offset, ...filters } = req.validatedQuery;
  const [roles, count] = await svc.listAndCountRoles(filters, {
    take: limit,
    skip: offset,
    order: { created_at: "DESC" },
  });
  res.json({ roles, count, limit, offset });
};
