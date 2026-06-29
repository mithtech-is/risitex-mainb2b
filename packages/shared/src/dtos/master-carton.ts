import { z } from "zod";

export const CreateMasterCartonDto = z
  .object({
    product_id: z.string().optional(),
    variant_id: z.string().optional(),
    units_per_carton: z.number().int().positive(),
    inner_packs: z.number().int().positive().optional(),
    carton_weight_grams: z.number().positive().optional(),
    carton_length_cm: z.number().positive().optional(),
    carton_width_cm: z.number().positive().optional(),
    carton_height_cm: z.number().positive().optional(),
    effective_from: z.coerce.date(),
    effective_to: z.coerce.date().optional(),
    active: z.boolean().default(true),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (v) => !!v.product_id || !!v.variant_id,
    {
      message: "either product_id or variant_id must be provided",
      path: ["variant_id"],
    },
  );
export type CreateMasterCartonInput = z.infer<typeof CreateMasterCartonDto>;

export const UpdateMasterCartonDto = z.object({
  units_per_carton: z.number().int().positive().optional(),
  inner_packs: z.number().int().positive().nullable().optional(),
  carton_weight_grams: z.number().positive().nullable().optional(),
  carton_length_cm: z.number().positive().nullable().optional(),
  carton_width_cm: z.number().positive().nullable().optional(),
  carton_height_cm: z.number().positive().nullable().optional(),
  effective_to: z.coerce.date().nullable().optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type UpdateMasterCartonInput = z.infer<typeof UpdateMasterCartonDto>;

export const ListMasterCartonsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  product_id: z.string().optional(),
  variant_id: z.string().optional(),
  active: z.coerce.boolean().optional(),
});
export type ListMasterCartonsQuery = z.infer<typeof ListMasterCartonsQueryDto>;

export const ComputeCartonBreakdownDto = z
  .object({
    variant_id: z.string().optional(),
    product_id: z.string().optional(),
    quantity: z.number().int().nonnegative(),
  })
  .refine(
    (v) => !!v.variant_id || !!v.product_id,
    { message: "variant_id or product_id required" },
  );
export type ComputeCartonBreakdownInput = z.infer<typeof ComputeCartonBreakdownDto>;
