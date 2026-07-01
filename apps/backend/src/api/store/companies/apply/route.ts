import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createHash } from "node:crypto"
import { z } from "zod"
import { COMPANY_MODULE, GSTIN_REGEX } from "../../../../modules/company"
import type { CompanyModuleService } from "../../../../modules/company"

/**
 * POST /store/companies/apply  (FR-1.02)
 *
 * Open intake — no authentication. Anyone can submit; ops gates
 * approval. We don't mint a Medusa customer here — the
 * /admin/companies/[id]/approve route does that, atomic with the
 * tier assignment.
 *
 * Body (Zod-validated):
 *   {
 *     gstin: string,                // 15-char India regex
 *     trade_name: string,
 *     applicant_email: string,      // contact at the applicant
 *     applicant_phone?: string,
 *     billing_address: {
 *       line1, line2?, city, state, postal_code, country_code
 *     },
 *     contact_name?: string,
 *   }
 *
 * Returns:
 *   { ok: true, application_id, status: 'pending' }
 *
 * 400 on validation error; 409 if GSTIN already has a company OR a
 * pending application.
 */
const BodySchema = z.object({
  gstin: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => GSTIN_REGEX.test(v), {
      message:
        "GSTIN must be a 15-character Indian GSTIN (e.g. 33AAACR5055K1ZK)",
    })
    .optional()
    .or(z.literal("")),
  trade_name: z.string().trim().min(2).max(200),
  applicant_email: z.string().email().trim().toLowerCase(),
  applicant_phone: z
    .string()
    .trim()
    .min(8)
    .max(20)
    .optional()
    .or(z.literal("")),
  billing_address: z.object({
    line1: z.string().trim().min(2).max(200),
    line2: z.string().trim().max(200).optional().or(z.literal("")),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(2).max(100),
    postal_code: z.string().trim().min(4).max(20),
    country_code: z
      .string()
      .trim()
      .length(2)
      .transform((v) => v.toLowerCase()),
  }),
  contact_name: z.string().trim().max(200).optional().or(z.literal("")),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Invalid application payload",
      errors: parsed.error.flatten(),
    })
  }

  const ip =
    (req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ?? "") ||
    req.ip ||
    ""
  const ipHash = ip ? createHash("sha256").update(ip).digest("hex") : null

  const companies =
    req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)

  // Re-shape the Zod-validated input into the service payload type.
  // Zod's transform/refine chain leaves several fields tagged optional
  // in the inferred type even though they are guaranteed present at
  // runtime; constructing the object explicitly here keeps the
  // service signature honest.
  const data = parsed.data
  const payload = {
    gstin: data.gstin,
    trade_name: data.trade_name,
    applicant_email: data.applicant_email,
    applicant_phone: data.applicant_phone || null,
    billing_address: {
      line1: data.billing_address.line1,
      line2: data.billing_address.line2 || null,
      city: data.billing_address.city,
      state: data.billing_address.state,
      postal_code: data.billing_address.postal_code,
      country_code: data.billing_address.country_code,
    },
    contact_name: data.contact_name || null,
  }

  try {
    const app = await companies.submitApplication({
      payload,
      ip_hash: ipHash,
    })

    // Auto-create company in pending status
    const [company] = await (companies as unknown as { createCompanies: (a: any[]) => Promise<any[]> }).createCompanies([
      {
        gstin: payload.gstin || null,
        applicant_email: payload.applicant_email,
        trade_name: payload.trade_name,
        billing_address: payload.billing_address as unknown as Record<string, unknown>,
        status: "pending",
        metadata: {
          applicant_email: payload.applicant_email,
          applicant_phone: payload.applicant_phone,
          application_id: app.id,
        },
      },
    ])

    // Link customer immediately if already registered
    try {
      const customerService = req.scope.resolve(Modules.CUSTOMER)
      const pgConn = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
        raw: (sql: string, bindings?: unknown[]) => Promise<unknown>
      }
      const email = payload.applicant_email
      const existing = await customerService.listCustomers({ email })
      const customer = existing[0]
      if (customer) {
        await customerService.updateCustomers(customer.id, {
          metadata: {
            ...(customer.metadata ?? {}),
            company_id: company.id,
          },
        })
        await pgConn.raw(
          `UPDATE customer SET company_id = ?, updated_at = now() WHERE id = ?`,
          [company.id, customer.id],
        )
      }
    } catch (linkErr) {
      // Best-effort linkage
    }

    return res.json({
      ok: true,
      application_id: app.id,
      status: app.status,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (/already exists|under review/i.test(msg)) {
      return res.status(409).json({ ok: false, message: msg })
    }
    return res.status(500).json({ ok: false, message: msg })
  }
}
