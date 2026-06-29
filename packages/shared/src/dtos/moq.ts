import { z } from "zod";

export const MOQ_RULE_TYPES = ["product", "category", "sales_channel", "default"] as const;

export const CreateMoqRuleDto = z
  .object({
    name: z.string().min(1).max(255),
    rule_type: z.enum(MOQ_RULE_TYPES),
    target_id: z.string().optional(),
    applies_to_tier_id: z.string().optional(),
    applies_to_company_id: z.string().optional(),
    min_quantity: z.number().int().positive(),
    increment_quantity: z.number().int().positive().default(1),
    effective_from: z.coerce.date(),
    effective_to: z.coerce.date().optional(),
    priority: z.number().int().min(0).max(1000).default(0),
    active: z.boolean().default(true),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (v) => v.rule_type === "default" || !!v.target_id,
    {
      message: "target_id is required for rule_type=product|category|sales_channel",
      path: ["target_id"],
    },
  );
export type CreateMoqRuleInput = z.infer<typeof CreateMoqRuleDto>;

export const UpdateMoqRuleDto = z.object({
  name: z.string().min(1).max(255).optional(),
  applies_to_tier_id: z.string().nullable().optional(),
  applies_to_company_id: z.string().nullable().optional(),
  min_quantity: z.number().int().positive().optional(),
  increment_quantity: z.number().int().positive().optional(),
  effective_to: z.coerce.date().nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type UpdateMoqRuleInput = z.infer<typeof UpdateMoqRuleDto>;

export const ListMoqRulesQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  rule_type: z.enum(MOQ_RULE_TYPES).optional(),
  target_id: z.string().optional(),
  applies_to_tier_id: z.string().optional(),
  applies_to_company_id: z.string().optional(),
  active: z.coerce.boolean().optional(),
});
export type ListMoqRulesQuery = z.infer<typeof ListMoqRulesQueryDto>;

export const ValidateMoqDto = z.object({
  quantity: z.number().int().nonnegative(),
  product_id: z.string().optional(),
  category_id: z.string().optional(),
  sales_channel_id: z.string().optional(),
  tier_id: z.string().optional(),
  company_id: z.string().optional(),
});
export type ValidateMoqInput = z.infer<typeof ValidateMoqDto>;
