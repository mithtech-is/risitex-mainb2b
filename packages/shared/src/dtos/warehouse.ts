import { z } from "zod";

export const EnsureWarehouseProfileDto = z.object({
  stock_location_id: z.string().min(1),
  gst_number: z
    .string()
    .regex(/^[0-9A-Z]{15}$/, "GST number must be 15 alphanumeric uppercase chars")
    .optional(),
  is_owned: z.boolean().default(true),
});
export type EnsureWarehouseProfileInput = z.infer<typeof EnsureWarehouseProfileDto>;

export const UpdateWarehouseProfileDto = z.object({
  gst_number: z
    .string()
    .regex(/^[0-9A-Z]{15}$/)
    .nullable()
    .optional(),
  is_owned: z.boolean().optional(),
  operating_hours: z.record(z.string(), z.unknown()).nullable().optional(),
  daily_dispatch_capacity: z.number().int().positive().nullable().optional(),
  contact_name: z.string().max(255).nullable().optional(),
  contact_phone: z.string().max(40).nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type UpdateWarehouseProfileInput = z.infer<typeof UpdateWarehouseProfileDto>;

export const ListWarehouseProfilesQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  stock_location_id: z.string().optional(),
  is_owned: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
});
export type ListWarehouseProfilesQuery = z.infer<typeof ListWarehouseProfilesQueryDto>;
