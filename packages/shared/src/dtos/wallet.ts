import { z } from "zod";

export const WALLET_OWNER_TYPES = ["customer", "company"] as const;
export const WALLET_REFERENCE_TYPES = [
  "order",
  "refund",
  "commission",
  "payout",
  "adjustment",
  "manual",
] as const;

const AmountMinor = z.union([
  z.number().int().positive(),
  z.string().regex(/^\d+$/, "must be a positive integer string"),
]);

export const EnsureWalletDto = z.object({
  owner_type: z.enum(WALLET_OWNER_TYPES),
  owner_id: z.string().min(1),
  currency_code: z.string().length(3).toLowerCase().optional(),
});
export type EnsureWalletInput = z.infer<typeof EnsureWalletDto>;

export const ListWalletsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  owner_type: z.enum(WALLET_OWNER_TYPES).optional(),
  owner_id: z.string().optional(),
  currency_code: z.string().length(3).toLowerCase().optional(),
  active: z.coerce.boolean().optional(),
});
export type ListWalletsQuery = z.infer<typeof ListWalletsQueryDto>;

export const ListWalletTransactionsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.enum(["credit", "debit"]).optional(),
  reference_type: z.enum(WALLET_REFERENCE_TYPES).optional(),
  reference_id: z.string().optional(),
});
export type ListWalletTransactionsQuery = z.infer<typeof ListWalletTransactionsQueryDto>;

export const CreditWalletDto = z.object({
  amount_minor: AmountMinor,
  idempotency_key: z.string().min(8).max(255),
  reference_type: z.enum(WALLET_REFERENCE_TYPES).optional(),
  reference_id: z.string().optional(),
  description: z.string().max(2000).optional(),
});
export type CreditWalletInput = z.infer<typeof CreditWalletDto>;

export const DebitWalletDto = CreditWalletDto;
export type DebitWalletInput = z.infer<typeof DebitWalletDto>;

export const UpdateWalletDto = z.object({
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type UpdateWalletInput = z.infer<typeof UpdateWalletDto>;
