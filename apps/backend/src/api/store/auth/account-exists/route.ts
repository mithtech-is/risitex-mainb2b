import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

/**
 * POST /store/auth/account-exists  →  { exists: boolean }
 *
 * Lets the storefront sign-in form tell apart "no account for this email"
 * (→ prompt to sign up) from "account exists but wrong password" (→ generic
 * invalid-credentials). "Exists" means there is an emailpass login identity
 * for the email.
 *
 * NOTE: this is, by design, an account-enumeration oracle — the product owner
 * accepted that trade-off for clearer UX. It is rate-limited in middlewares.ts
 * to slow bulk probing, and registration already reveals the same fact.
 *
 * Fail-safe: on any internal error we return exists:true, so a transient DB
 * hiccup never wrongly tells a real customer they have no account.
 */
const BodySchema = z.object({ email: z.string().email() })

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "A valid email is required" })
  }
  const email = parsed.data.email.trim().toLowerCase()

  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
    raw: (sql: string, b?: unknown[]) => Promise<{ rows?: unknown[] }>
  }
  try {
    const r = await pg.raw(
      `SELECT 1 FROM provider_identity
        WHERE provider = 'emailpass' AND lower(entity_id) = ?
        LIMIT 1`,
      [email],
    )
    return res.json({ exists: (r.rows ?? []).length > 0 })
  } catch {
    return res.json({ exists: true })
  }
}
