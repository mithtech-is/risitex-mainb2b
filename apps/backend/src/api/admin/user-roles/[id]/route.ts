import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { RBAC_MODULE } from "../../../../modules/rbac";
import type RbacModuleService from "../../../../modules/rbac/service";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  const grant = await svc.retrieveUserRole(req.params.id);
  res.json({ grant });
};

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  await svc.revokeGrant(req.params.id);
  res.json({ id: req.params.id, deleted: true });
};
