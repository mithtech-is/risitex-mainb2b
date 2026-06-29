import { z } from "zod";

export const TierAppliesToSchema = z.enum(["b2b"]);
export type TierAppliesTo = z.infer<typeof TierAppliesToSchema>;

export const CreateCustomerTierDto = z.object({
  code: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/, "code must be snake_case"),
  display_name: z.string().min(1).max(120),
  rank: z.number().int().min(1).max(1000),
  applies_to: TierAppliesToSchema,
  discount_percent: z.number().min(0).max(100).default(0),
  moq_multiplier: z.number().min(0.01).max(100).default(1),
  default_credit_limit_inr: z.number().min(0).default(0),
  credit_payment_terms_days: z.number().int().min(0).max(365).default(0),
  can_see_wholesale_pricing: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateCustomerTierInput = z.infer<typeof CreateCustomerTierDto>;

export const UpdateCustomerTierDto = CreateCustomerTierDto.partial();
export type UpdateCustomerTierInput = z.infer<typeof UpdateCustomerTierDto>;

export const ListCustomerTiersQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  applies_to: TierAppliesToSchema.optional(),
});
export type ListCustomerTiersQuery = z.infer<typeof ListCustomerTiersQueryDto>;

export const AssignCompanyToTierDto = z.object({
  tier_id: z.string().min(1),
  assigned_by_user_id: z.string().optional(),
  reason: z.string().max(2000).optional(),
});
export type AssignCompanyToTierInput = z.infer<typeof AssignCompanyToTierDto>;
