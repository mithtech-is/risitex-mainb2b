/**
 * @risitex/shared — types, constants, and Zod schemas shared across RISITEX apps.
 *
 * Conventions:
 * - DTOs (input/output schemas for API boundaries) live in `dtos/`.
 * - One file per domain (company, customer-tier, sales-rep, wallet, ...).
 * - Each file exports both the Zod schema (PascalCase + `Dto` suffix) and
 *   the inferred TypeScript type.
 */

export const RISITEX_SHARED_VERSION = "0.1.0";

// DTOs (Phase 6+)
export * from "./dtos/company";
export * from "./dtos/customer-tier";
export * from "./dtos/sales-rep";
export * from "./dtos/wallet";
export * from "./dtos/commission";
export * from "./dtos/matrix-ordering";
export * from "./dtos/moq";
export * from "./dtos/master-carton";
export * from "./dtos/erp-sync";
export * from "./dtos/warehouse";
export * from "./dtos/logistics";
export * from "./dtos/rbac";
