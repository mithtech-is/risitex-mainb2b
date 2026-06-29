import { z } from "zod";

export const MATRIX_DIMENSION_TYPES = [
  "size",
  "color",
  "fit",
  "length",
  "fabric",
  "other",
] as const;

const Slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "must be lowercase alphanumeric + hyphen");

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #RRGGBB");

export const CreateMatrixDimensionDto = z.object({
  code: Slug,
  display_name: z.string().min(1).max(120),
  dimension_type: z.enum(MATRIX_DIMENSION_TYPES),
  sort_order: z.number().int().min(0).max(10000).default(0),
  active: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateMatrixDimensionInput = z.infer<typeof CreateMatrixDimensionDto>;

export const UpdateMatrixDimensionDto = CreateMatrixDimensionDto.partial();
export type UpdateMatrixDimensionInput = z.infer<typeof UpdateMatrixDimensionDto>;

export const ListMatrixDimensionsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  dimension_type: z.enum(MATRIX_DIMENSION_TYPES).optional(),
  active: z.coerce.boolean().optional(),
});
export type ListMatrixDimensionsQuery = z.infer<typeof ListMatrixDimensionsQueryDto>;

export const AddDimensionValueDto = z.object({
  code: Slug,
  display_name: z.string().min(1).max(120),
  sort_order: z.number().int().min(0).max(10000).default(0),
  hex_color: Hex.optional(),
});
export type AddDimensionValueInput = z.infer<typeof AddDimensionValueDto>;

export const AttachProductMatrixDto = z.object({
  product_id: z.string().min(1),
  row_dimension_id: z.string().min(1),
  col_dimension_id: z.string().min(1),
});
export type AttachProductMatrixInput = z.infer<typeof AttachProductMatrixDto>;

export const UpsertMatrixCellsDto = z.object({
  cells: z
    .array(
      z.object({
        row_value_id: z.string().min(1),
        col_value_id: z.string().min(1),
        variant_id: z.string().min(1),
        sku: z.string().max(255).optional(),
      }),
    )
    .min(1)
    .max(1000),
});
export type UpsertMatrixCellsInput = z.infer<typeof UpsertMatrixCellsDto>;

export const ListMatrixProductsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  active: z.coerce.boolean().optional(),
});
export type ListMatrixProductsQuery = z.infer<typeof ListMatrixProductsQueryDto>;
