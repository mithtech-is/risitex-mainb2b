import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import type { z } from "zod";
import type { SetRolePermissionsDto } from "../../../../validators/rbac";
import { RBAC_MODULE } from "../../../../../modules/rbac";
import type RbacModuleService from "../../../../../modules/rbac/service";

type Body = z.infer<typeof SetRolePermissionsDto>;

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  const permissions = await svc.listRolePermissions({ role_id: req.params.id });
  res.json({ permissions });
};

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  const permissions = await svc.setRolePermissions({
    role_id: req.params.id,
    permissions: req.validatedBody.permissions,
  });
  res.json({ permissions });
};
