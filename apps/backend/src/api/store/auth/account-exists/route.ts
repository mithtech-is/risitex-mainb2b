import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createHash } from "node:crypto"
import { z } from "zod"

/**
 * POST /store/auth/account-exists  →  { exists: boolean, by?: "email"|"pan"|"mobile" }
 *
 * Sign-in flow uses this to tell "no account for this email" from
 * "account exists but wrong password". Sign-up flow uses it pre-submit
 * to fail-fast on duplicate email / PAN / mobile so the customer gets
 * a friendly message instead of a 500 from a Postgres unique-index
 * violation.
 *
 * Accepts any combination of { email, pan, mobile }. Returns the FIRST
 * match's source field in `by`. If none match, returns exists:false.
 *
 * NOTE: this is, by design, an account-enumeration oracle — the product
 * owner accepted that trade-off for clearer UX. It is rate-limited in
 * middlewares.ts to slow bulk probing, and registration already reveals
 * the same fact.
 *
 * Fail-safe: on any internal error we return exists:true, so a transient
 * DB hiccup never wrongly tells a real customer they have no account.
 */
const BodySchema = z
  .object({
    email: z.string().email().optional(),
    pan: z.string().trim().toUpperCase().optional(),
    mobile: z.string().trim().optional(),
  })
  .refine((d) => !!d.email || !!d.pan || !!d.mobile, {
    message: "Supply at least one of email, pan, or mobile.",
  })

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/

/** Strip non-digits, prepend +91 if not already E.164. */
function normalizeIndianPhone(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith("+")) return trimmed
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`
  return trimmed
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Supply email, pan, or mobile." })
  }
  const { email, pan, mobile } = parsed.data

  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
    raw: (sql: string, b?: unknown[]) => Promise<{ rows?: unknown[] }>
  }

  try {
    // 1. Email — also used by sign-in flow, kept first for parity.
    if (email) {
      const e = email.trim().toLowerCase()
      const r = await pg.raw(
        `SELECT 1 FROM provider_identity
          WHERE provider = 'emailpass' AND lower(entity_id) = ?
          LIMIT 1`,
        [e],
      )
      if ((r.rows ?? []).length > 0) {
        return res.json({ exists: true, by: "email" })
      }
    }

    // 2. PAN — hashed the same way the KYC manual flow does so the
    //    comparison works against existing customer.metadata.pan_hash
    //    anchors. Stored PAN values are never plaintext.
    if (pan && PAN_REGEX.test(pan)) {
      const panHash = createHash("sha256").update(pan).digest("hex")
      const r = await pg.raw(
        `SELECT 1 FROM customer
          WHERE metadata->>'pan_hash' = ? AND deleted_at IS NULL
          LIMIT 1`,
        [panHash],
      )
      if ((r.rows ?? []).length > 0) {
        return res.json({ exists: true, by: "pan" })
      }
    }

    // 3. Mobile — normalise to E.164 first so a buyer typing
    //    "9876543210" matches a stored "+919876543210".
    if (mobile) {
      const e164 = normalizeIndianPhone(mobile)
      const r = await pg.raw(
        `SELECT 1 FROM customer
          WHERE phone = ? AND deleted_at IS NULL
          LIMIT 1`,
        [e164],
      )
      if ((r.rows ?? []).length > 0) {
        return res.json({ exists: true, by: "mobile" })
      }
    }

    return res.json({ exists: false })
  } catch {
    return res.json({ exists: true })
  }
}
