import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import type { z } from "zod";
import type { UpdateRoleDto } from "../../../validators/rbac";
import { RBAC_MODULE } from "../../../../modules/rbac";
import type RbacModuleService from "../../../../modules/rbac/service";

type Body = z.infer<typeof UpdateRoleDto>;

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  const role = await svc.retrieveRole(req.params.id);
  const permissions = await svc.listRolePermissions({ role_id: role.id });
  res.json({ role, permissions });
};

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  const [role] = await svc.updateRoles([{ id: req.params.id, ...req.validatedBody }]);
  res.json({ role });
};

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  const role = await svc.retrieveRole(req.params.id);
  if (role.is_system) {
    res.status(400).json({ error: "Cannot delete system role" });
    return;
  }
  await svc.softDeleteRoles([req.params.id]);
  res.json({ id: req.params.id, deleted: true });
};
