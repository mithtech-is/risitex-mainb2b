import { z } from "zod";

export const CreateSalesRepDto = z.object({
  medusa_user_id: z.string().min(1),
  employee_code: z.string().max(40).optional(),
  display_name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().max(40).optional(),
  territory: z.string().max(120).optional(),
  base_commission_percent: z.number().min(0).max(100).default(0),
  active: z.boolean().default(true),
  hired_at: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateSalesRepInput = z.infer<typeof CreateSalesRepDto>;

export const UpdateSalesRepDto = CreateSalesRepDto.partial();
export type UpdateSalesRepInput = z.infer<typeof UpdateSalesRepDto>;

export const ListSalesRepsQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  active: z.coerce.boolean().optional(),
  territory: z.string().optional(),
  q: z.string().max(255).optional(),
});
export type ListSalesRepsQuery = z.infer<typeof ListSalesRepsQueryDto>;

export const AssignRepToCompanyDto = z.object({
  company_id: z.string().min(1),
  is_primary: z.boolean().default(true),
});
export type AssignRepToCompanyInput = z.infer<typeof AssignRepToCompanyDto>;

export const StartImpersonationDto = z.object({
  company_id: z.string().min(1),
  customer_id: z.string().optional(),
});
export type StartImpersonationInput = z.infer<typeof StartImpersonationDto>;

export const EndImpersonationDto = z.object({
  ended_reason: z.string().max(2000).optional(),
});
