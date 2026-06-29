import { z } from "zod";

export const ERP_ENTITY_TYPES = [
  "customer",
  "company",
  "product",
  "order",
  "refund",
  "payment",
  "fulfillment",
  "commission",
  "wallet_transaction",
] as const;

export const ERP_OPERATIONS = ["create", "update", "delete", "custom_action"] as const;
export const ERP_JOB_STATUSES = [
  "pending",
  "in_flight",
  "succeeded",
  "failed",
  "dead",
] as const;

export const EnqueueErpSyncDto = z.object({
  operation: z.enum(ERP_OPERATIONS),
  medusa_entity_type: z.enum(ERP_ENTITY_TYPES),
  medusa_entity_id: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  idempotency_key: z.string().min(8).max(255),
  erpnext_doctype: z.string().max(120).optional(),
  erpnext_name: z.string().max(255).optional(),
  max_attempts: z.number().int().min(1).max(20).default(5),
  reference_workflow_run_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type EnqueueErpSyncInput = z.infer<typeof EnqueueErpSyncDto>;

export const ListErpSyncJobsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(ERP_JOB_STATUSES).optional(),
  medusa_entity_type: z.enum(ERP_ENTITY_TYPES).optional(),
  medusa_entity_id: z.string().optional(),
  operation: z.enum(ERP_OPERATIONS).optional(),
});
export type ListErpSyncJobsQuery = z.infer<typeof ListErpSyncJobsQueryDto>;

export const ListErpSyncEntitiesQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  medusa_entity_type: z.enum(ERP_ENTITY_TYPES).optional(),
  medusa_entity_id: z.string().optional(),
  erpnext_doctype: z.string().optional(),
  last_sync_status: z.enum(["success", "failed"]).optional(),
});
export type ListErpSyncEntitiesQuery = z.infer<typeof ListErpSyncEntitiesQueryDto>;

export const KillErpSyncJobDto = z.object({
  reason: z.string().max(2000).optional(),
});
export type KillErpSyncJobInput = z.infer<typeof KillErpSyncJobDto>;
