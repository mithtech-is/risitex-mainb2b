import { z } from "zod";

export const COMMISSION_EARNER_TYPES = ["sales_rep"] as const;
export const COMMISSION_REFERENCE_TYPES = ["order", "refund", "manual"] as const;
export const COMMISSION_STATUSES = ["pending", "paid", "void"] as const;

const AmountMinor = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/, "must be a non-negative integer string"),
]);

export const CreateCommissionRuleDto = z
  .object({
    name: z.string().min(1).max(255),
    earner_type: z.enum(COMMISSION_EARNER_TYPES),
    earner_id: z.string().min(1),
    applies_to_company_id: z.string().optional(),
    applies_to_tier_id: z.string().optional(),
    applies_to_product_id: z.string().optional(),
    percent: z.number().min(0).max(100).default(0),
    flat_amount_minor: AmountMinor.optional(),
    effective_from: z.coerce.date(),
    effective_to: z.coerce.date().optional(),
    priority: z.number().int().min(0).max(1000).default(0),
    active: z.boolean().default(true),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (v) => v.percent > 0 || v.flat_amount_minor !== undefined,
    { message: "either percent > 0 OR flat_amount_minor must be set" },
  );
export type CreateCommissionRuleInput = z.infer<typeof CreateCommissionRuleDto>;

export const UpdateCommissionRuleDto = z.object({
  name: z.string().min(1).max(255).optional(),
  applies_to_company_id: z.string().nullable().optional(),
  applies_to_tier_id: z.string().nullable().optional(),
  applies_to_product_id: z.string().nullable().optional(),
  percent: z.number().min(0).max(100).optional(),
  flat_amount_minor: AmountMinor.nullable().optional(),
  effective_to: z.coerce.date().nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type UpdateCommissionRuleInput = z.infer<typeof UpdateCommissionRuleDto>;

export const ListCommissionRulesQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  earner_type: z.enum(COMMISSION_EARNER_TYPES).optional(),
  earner_id: z.string().optional(),
  active: z.coerce.boolean().optional(),
});
export type ListCommissionRulesQuery = z.infer<typeof ListCommissionRulesQueryDto>;

export const ListCommissionRecordsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  earner_type: z.enum(COMMISSION_EARNER_TYPES).optional(),
  earner_id: z.string().optional(),
  status: z.enum(COMMISSION_STATUSES).optional(),
  reference_type: z.enum(COMMISSION_REFERENCE_TYPES).optional(),
  reference_id: z.string().optional(),
});
export type ListCommissionRecordsQuery = z.infer<typeof ListCommissionRecordsQueryDto>;

export const PayCommissionRecordDto = z.object({
  wallet_transaction_id: z.string().min(1),
});
export type PayCommissionRecordInput = z.infer<typeof PayCommissionRecordDto>;

export const VoidCommissionRecordDto = z.object({
  reason: z.string().max(2000).optional(),
});
export type VoidCommissionRecordInput = z.infer<typeof VoidCommissionRecordDto>;
