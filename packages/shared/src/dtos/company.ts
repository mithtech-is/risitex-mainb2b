import { z } from "zod";

// Indian GSTIN: 15 chars. <2 digit state><10 char PAN><1 digit entity><1 char Z><1 char checksum>
export const GSTINRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Indian PAN: 10 chars. <5 letters><4 digits><1 letter>
export const PANRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export const CompanyApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "suspended",
]);
export type CompanyApprovalStatus = z.infer<typeof CompanyApprovalStatusSchema>;

export const CompanyMemberRoleSchema = z.enum(["owner", "buyer", "viewer"]);
export type CompanyMemberRole = z.infer<typeof CompanyMemberRoleSchema>;

const AddressSchema = z
  .object({
    line1: z.string().min(1).max(255).optional(),
    line2: z.string().max(255).optional(),
    city: z.string().min(1).max(120).optional(),
    state: z.string().min(1).max(120).optional(),
    postal_code: z.string().max(20).optional(),
    country_code: z.string().length(2).optional(),
  })
  .passthrough();

export const CreateCompanyDto = z.object({
  legal_name: z.string().min(1).max(255),
  display_name: z.string().min(1).max(255),
  gstin: z.string().regex(GSTINRegex, "Invalid GSTIN").optional(),
  pan: z.string().regex(PANRegex, "Invalid PAN").optional(),
  email: z.string().email().max(255),
  phone: z.string().max(40).optional(),
  billing_address: AddressSchema.optional(),
  shipping_address: AddressSchema.optional(),
  primary_customer_id: z.string().optional(),
  tier_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateCompanyInput = z.infer<typeof CreateCompanyDto>;

export const UpdateCompanyDto = CreateCompanyDto.partial();
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyDto>;

export const ListCompaniesQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  approval_status: CompanyApprovalStatusSchema.optional(),
  email: z.string().email().optional(),
  q: z.string().max(255).optional(),
});
export type ListCompaniesQuery = z.infer<typeof ListCompaniesQueryDto>;

export const ApproveCompanyDto = z.object({
  approved_by_user_id: z.string().min(1),
});

export const RejectCompanyDto = z.object({
  reason: z.string().min(1).max(2000),
});

export const SuspendCompanyDto = z.object({
  reason: z.string().min(1).max(2000),
});

export const AddCompanyMemberDto = z.object({
  customer_id: z.string().min(1),
  role: CompanyMemberRoleSchema.default("buyer"),
});
export type AddCompanyMemberInput = z.infer<typeof AddCompanyMemberDto>;
