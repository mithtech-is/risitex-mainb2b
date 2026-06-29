import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

/**
 * POST /store/checkout/address/validate
 *
 * Server-side address validation gate the storefront calls before
 * letting the customer advance past the shipping-address step.
 *
 * Validates:
 *   - first_name, last_name non-empty
 *   - address_1 non-empty
 *   - city non-empty
 *   - province (state) non-empty (must match the Indian-state list)
 *   - postal_code is a 6-digit Indian PIN
 *   - country_code is "in"
 *   - phone is a 10-digit Indian mobile, possibly prefixed with +91
 *
 * Returns:
 *   200 { ok: true, normalised: {...} } — fields trimmed + phone
 *                                         normalised to E.164
 *   422 { ok: false, errors: {...} }    — per-field error map
 *
 * Auth: customer (gated by the /store/checkout* middleware).
 */

const INDIAN_STATES = new Set([
    "Andaman and Nicobar Islands",
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chandigarh",
    "Chhattisgarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu and Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Ladakh",
    "Lakshadweep",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Puducherry",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
])

const BodySchema = z.object({
    first_name: z.string().min(1, "First name is required").max(80),
    last_name: z.string().min(1, "Last name is required").max(80),
    address_1: z.string().min(1, "Address line 1 is required").max(200),
    address_2: z.string().max(200).optional().nullable(),
    city: z.string().min(1, "City is required").max(80),
    province: z
        .string()
        .min(1, "State is required")
        .refine(
            (v) => INDIAN_STATES.has(v),
            "Choose an Indian state from the list",
        ),
    postal_code: z
        .string()
        .regex(/^[1-9][0-9]{5}$/, "Postal code must be a valid 6-digit Indian PIN"),
    country_code: z
        .string()
        .toLowerCase()
        .refine((v) => v === "in", "Country must be India (in)"),
    phone: z.string().min(1, "Phone is required"),
})

/**
 * Normalise a phone string to Indian E.164 (+91XXXXXXXXXX). Returns
 * null when the string can't be interpreted as a valid Indian mobile.
 */
function normaliseIndianPhone(input: string): string | null {
    const digits = input.replace(/\D/g, "")
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
        return `+91${digits}`
    }
    if (digits.length === 12 && /^91[6-9]/.test(digits)) {
        return `+${digits}`
    }
    return null
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) {
        const flat = parsed.error.flatten()
        return res.status(422).json({
            ok: false,
            code: "address.invalid",
            message: "Some address fields need attention.",
            errors: flat.fieldErrors,
        })
    }
    const data = parsed.data

    const e164 = normaliseIndianPhone(data.phone)
    if (!e164) {
        return res.status(422).json({
            ok: false,
            code: "address.invalid",
            message: "Phone must be a 10-digit Indian mobile number.",
            errors: { phone: ["Enter a valid 10-digit Indian mobile number"] },
        })
    }

    return res.json({
        ok: true,
        normalised: {
            first_name: data.first_name.trim(),
            last_name: data.last_name.trim(),
            address_1: data.address_1.trim(),
            address_2: data.address_2?.trim() || null,
            city: data.city.trim(),
            province: data.province,
            postal_code: data.postal_code,
            country_code: data.country_code,
            phone: e164,
        },
    })
}
