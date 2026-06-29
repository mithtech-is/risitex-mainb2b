import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import type { z } from "zod";
import type {
  EnsureWarehouseProfileDto,
  ListWarehouseProfilesQueryDto,
} from "../../validators/warehouse";
import { WAREHOUSE_MODULE } from "../../../modules/warehouse";
import type WarehouseModuleService from "../../../modules/warehouse/service";

type Body = z.infer<typeof EnsureWarehouseProfileDto>;
type Query = z.infer<typeof ListWarehouseProfilesQueryDto>;

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const svc = req.scope.resolve<WarehouseModuleService>(WAREHOUSE_MODULE);
  const profile = await svc.ensureProfile(req.validatedBody);
  res.status(201).json({ profile });
};

export const GET = async (req: MedusaRequest<unknown, Query>, res: MedusaResponse) => {
  const svc = req.scope.resolve<WarehouseModuleService>(WAREHOUSE_MODULE);
  const { limit, offset, ...filters } = req.validatedQuery;
  const [profiles, count] = await svc.listAndCountWarehouseProfiles(filters, {
    take: limit,
    skip: offset,
    order: { created_at: "DESC" },
  });
  res.json({ profiles, count, limit, offset });
};
