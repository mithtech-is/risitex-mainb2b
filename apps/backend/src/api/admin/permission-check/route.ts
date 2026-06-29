import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import type { z } from "zod";
import type { CheckPermissionDto } from "../../validators/rbac";
import { RBAC_MODULE } from "../../../modules/rbac";
import type RbacModuleService from "../../../modules/rbac/service";

type Body = z.infer<typeof CheckPermissionDto>;

/**
 * Programmatic permission check for any actor (used by admin UI to
 * pre-disable buttons, etc.).
 */
export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const svc = req.scope.resolve<RbacModuleService>(RBAC_MODULE);
  const allowed = await svc.hasPermission(req.validatedBody);
  res.json({ allowed, ...req.validatedBody });
};
