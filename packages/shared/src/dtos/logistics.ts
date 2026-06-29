import { z } from "zod";

export const LOGISTICS_PROVIDER_TYPES = [
  "last_mile",
  "line_haul",
  "hyperlocal",
  "self",
] as const;

export const SHIPMENT_STATUSES = [
  "created",
  "label_generated",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "attempted",
  "rto",
  "lost",
  "returned",
  "cancelled",
] as const;

const Slug = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9_-]+$/, "must be lowercase alphanumeric + _ -");

const AmountMinor = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/, "must be non-negative integer string"),
]);

export const CreateLogisticsProviderDto = z.object({
  code: Slug,
  display_name: z.string().min(1).max(255),
  provider_type: z.enum(LOGISTICS_PROVIDER_TYPES),
  api_credentials_ref: z.string().max(255).optional(),
  supports_cod: z.boolean().default(false),
  supports_b2b: z.boolean().default(true),
  supports_reverse: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateLogisticsProviderInput = z.infer<typeof CreateLogisticsProviderDto>;

export const UpdateLogisticsProviderDto = CreateLogisticsProviderDto.partial().omit({
  code: true,
});
export type UpdateLogisticsProviderInput = z.infer<typeof UpdateLogisticsProviderDto>;

export const ListLogisticsProvidersQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  provider_type: z.enum(LOGISTICS_PROVIDER_TYPES).optional(),
  active: z.coerce.boolean().optional(),
});
export type ListLogisticsProvidersQuery = z.infer<typeof ListLogisticsProvidersQueryDto>;

export const CreateShipmentDto = z.object({
  medusa_fulfillment_id: z.string().min(1),
  provider_id: z.string().min(1),
  carton_count: z.number().int().positive().default(1),
  declared_value_minor: AmountMinor,
  cod_amount_minor: AmountMinor.optional(),
  rate_quote_minor: AmountMinor.optional(),
  estimated_delivery_at: z.coerce.date().optional(),
});
export type CreateShipmentInput = z.infer<typeof CreateShipmentDto>;

export const UpdateShipmentStatusDto = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  tracking_number: z.string().max(120).optional(),
  awb_number: z.string().max(120).optional(),
  at: z.coerce.date().optional(),
});
export type UpdateShipmentStatusInput = z.infer<typeof UpdateShipmentStatusDto>;

export const ListShipmentsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(SHIPMENT_STATUSES).optional(),
  provider_id: z.string().optional(),
  medusa_fulfillment_id: z.string().optional(),
});
export type ListShipmentsQuery = z.infer<typeof ListShipmentsQueryDto>;
