import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import type { z } from "zod";
import type { UpdateWarehouseProfileDto } from "../../../validators/warehouse";
import { WAREHOUSE_MODULE } from "../../../../modules/warehouse";
import type WarehouseModuleService from "../../../../modules/warehouse/service";

type Body = z.infer<typeof UpdateWarehouseProfileDto>;

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve<WarehouseModuleService>(WAREHOUSE_MODULE);
  const profile = await svc.retrieveWarehouseProfile(req.params.id);
  res.json({ profile });
};

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const svc = req.scope.resolve<WarehouseModuleService>(WAREHOUSE_MODULE);
  const [profile] = await svc.updateWarehouseProfiles([
    { id: req.params.id, ...req.validatedBody },
  ]);
  res.json({ profile });
};
