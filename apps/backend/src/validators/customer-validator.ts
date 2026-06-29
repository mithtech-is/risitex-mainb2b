import { z } from "zod";

/**
 * Customer-facing update validator for `POST /store/customers/me`.
 *
 * After the Cashfree Secure ID rollout, the canonical source of truth for
 * KYC state lives in the `cashfree_wallet` tables (SecureIdVerification,
 * BankAccount, DematAccount). Customers MUST NOT be able to flip their
 * own `kyc_status` by writing to `customer.metadata` — so the schema no
 * longer accepts any `kyc_*` keys. `manual_investments` is the only
 * customer-writable metadata field that remains.
 *
 * Any extra keys in `metadata` are stripped (non-passthrough). The legacy
 * `kyc_*` shapes still exist on some old rows; they're ignored by the new
 * derived `getKycStatus` helper and left alone for audit purposes.
 */

/**
 * Manually-tracked holding shape. Two ways to capture quantity + cost:
 *
 *   1. New model (preferred):
 *        shares: "100"
 *        pricePaidPerShare: "250.50"
 *      → derived amount = shares * pricePaidPerShare, plus growth vs current
 *        market price (computed at render time using product list).
 *
 *   2. Legacy:
 *        amount: "25050"   (lump-sum paid; no per-share data)
 *
 * Both are accepted so we don't break customers who added holdings under
 * the old form.
 */
export const ManualInvestmentSchema = z
    .object({
        id: z.string(),
        companyName: z.string(),
        platform: z.string().optional().or(z.literal("")),
        isin: z
            .string()
            .length(12, "ISIN must be exactly 12 characters")
            .regex(/^[A-Z0-9]{12}$/, "ISIN must contain only uppercase letters and numbers")
            .optional()
            .or(z.literal("")),
        date: z.string(),
        // New shape — string-typed because metadata serializes to JSON and
        // numeric strings travel safer.
        shares: z.string().optional().or(z.literal("")),
        pricePaidPerShare: z.string().optional().or(z.literal("")),
        // Legacy fallback — the lump-sum amount.
        amount: z.string().optional().or(z.literal("")),
    })
    .refine(
        (v) =>
            !!(v.shares && v.pricePaidPerShare) || !!v.amount,
        "Either shares + pricePaidPerShare OR amount is required"
    );

// Strict allowlist — any other key in metadata is stripped by zod.
// Document URLs are optional uploads kept for admin review / manual KYC
// audit. Uploads are NOT a gate for placing orders. Accepted paths are our
// own `/static/…` uploads or fully-qualified http(s) URLs (future S3/CDN).
const DocumentUrlSchema = z
    .string()
    .trim()
    .refine(
        (s) => s.startsWith("/static/") || /^https?:\/\//i.test(s),
        "Invalid document URL — must be /static/… or https://…"
    );

export const CustomerMetadataSchema = z.object({
    manual_investments: z.array(ManualInvestmentSchema).optional(),
    pan_card_file_url: DocumentUrlSchema.optional().nullable(),
    aadhaar_card_file_url: DocumentUrlSchema.optional().nullable(),
    // B2B registration fields — stored during sign-up and wholesale apply
    company_name: z.string().optional().nullable(),
    gstin: z.string().optional().nullable(),
    business_type: z.string().optional().nullable(),
    owner_name: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    pincode: z.string().optional().nullable(),
    trade_license: z.string().optional().nullable(),
});

export const CustomerUpdateSchema = z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    metadata: CustomerMetadataSchema.optional(),
}).passthrough();
