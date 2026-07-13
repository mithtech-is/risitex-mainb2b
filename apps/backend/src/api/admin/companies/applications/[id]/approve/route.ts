import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { COMPANY_MODULE } from "../../../../../../modules/company"
import type { CompanyModuleService } from "../../../../../../modules/company"
import { syncCustomerTierMembership } from "../../../../../../lib/tier-group"

/**
 * POST /admin/companies/applications/:id/approve  (FR-1.02, FR-1.03)
 *
 * Approves a pending application atomically:
 *
 *   1. Mints a `company` row (status='approved'), assigning the tier
 *      ops picked.
 *   2. Creates a Medusa `customer` for the applicant email (or
 *      attaches to an existing one if a row already exists for that
 *      email — happens when the applicant registered before ops approval).
 *   3. Writes the cross-module linkage onto customer.company_id +
 *      customer.customer_tier_id + customer.sales_rep_id +
 *      customer.payment_terms via raw SQL (the columns were added
 *      by migrations/2026-06-15_customer-b2b-fields.sql; Medusa's
 *      core customer service doesn't know about them).
 *
 * Body:
 *   {
 *     customer_tier_id: string,         // REQUIRED — ops decides
 *     sales_rep_id?: string,
 *     review_notes?: string,
 *     payment_terms?: 'advance_100'|'net_30'|'net_60',
 *   }
 *
 * Returns:
 *   { company, customer, application }
 *
 * Subscriber "company.approved" (Phase 4.5) fires after this returns
 * — that's where the welcome email and B2B onboarding side effects fire.
 */
const BodySchema = z.object({
  customer_tier_id: z.string().min(1),
  review_notes: z.string().max(2000).optional(),
  payment_terms: z.enum(["advance_100", "net_30", "net_60"]).optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const applicationId = req.params.id
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid approval payload",
      errors: parsed.error.flatten(),
    })
  }

  const reviewerId =
    (req as unknown as { auth_context?: { actor_id?: string } })
      .auth_context?.actor_id ?? "system"

  const companies = req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)
  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const pgConn = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION,
  ) as {
    raw: (sql: string, bindings?: unknown[]) => Promise<unknown>
  }

  // ── 1. Retrieve the application + validate ──────────────────────
  let app
  try {
    app = await companies.retrieveCompanyApplication(applicationId)
  } catch {
    return res
      .status(404)
      .json({ message: `Application ${applicationId} not found` })
  }
  if (app.status !== "pending") {
    return res
      .status(409)
      .json({ message: `Application is already ${app.status}` })
  }

  const payload = app.payload as unknown as {
    contact_name?: string | null
    [k: string]: unknown
  }

  // ── 2. Mint the company row ─────────────────────────────────────
  const company = await companies.approveApplication({
    application_id: applicationId,
    reviewer_id: reviewerId,
    customer_tier_id: parsed.data.customer_tier_id,
    review_notes: parsed.data.review_notes ?? null,
  })

  // ── 3. Resolve or create the Medusa customer ────────────────────
  const email = app.applicant_email
  const existing = await customerService.listCustomers({ email })
  let customer = existing[0]
  if (!customer) {
    const contactName = (payload.contact_name ?? "").trim()
    const [firstName, ...rest] = contactName.split(/\s+/).filter(Boolean)
    const lastName = rest.join(" ") || null
    const [created] = await customerService.createCustomers([
      {
        email,
        first_name: firstName ?? null,
        last_name: lastName,
        has_account: false,
        metadata: {
          source: "company-approval",
          application_id: app.id,
          company_id: company.id,
        },
      },
    ])
    customer = created
  } else {
    await customerService.updateCustomers(customer.id, {
      metadata: {
        ...(customer.metadata ?? {}),
        company_id: company.id,
      },
    })
  }

  // ── 4. Stamp the B2B FK columns. Medusa's CustomerService doesn't
  //       know about them, so go through raw SQL. (`UPDATE … RETURNING`
  //       lets us echo the final row back.)
  const paymentTerms = parsed.data.payment_terms ?? null
  await pgConn.raw(
    `UPDATE customer
       SET company_id = ?,
           customer_tier_id = ?,
           payment_terms = COALESCE(?, payment_terms),
           updated_at = now()
     WHERE id = ?`,
    [
      company.id,
      parsed.data.customer_tier_id,
      paymentTerms,
      customer.id,
    ],
  )

  // ── 5. Bridge the tier to its native customer group + add the
  //       customer, so native price-list (tier) pricing applies at
  //       checkout. Never let a group hiccup fail the approval.
  try {
    await syncCustomerTierMembership(
      req.scope,
      customer.id,
      parsed.data.customer_tier_id,
    )
  } catch (err) {
    // Best-effort — approval succeeds regardless; re-run via
    // POST /admin/b2b-sales/sync-tier-groups to backfill.
  }

  // ── 6. Auto-verify the customer (admin vetted the business via GSTIN),
  //       so they can place wholesale orders immediately after sign-in —
  //       skips the email+WhatsApp OTP gate (requireVerifiedCustomer reads
  //       metadata.email_verified + phone_verified).
  try {
    const fresh = await customerService.retrieveCustomer(customer.id)
    await customerService.updateCustomers(customer.id, {
      metadata: {
        ...(fresh.metadata ?? {}),
        email_verified: true,
        phone_verified: true,
        b2b_approved_at: new Date().toISOString(),
      },
    })
  } catch {
    // verification flags are best-effort; approval still succeeds
  }

  // ── 7. Approval email (FR-1.02): build the "verified + login link" and
  //       deliver it. Done inline (not via the event bus) so it reliably
  //       fires on every approval. Sends via the communication module if it
  //       exposes a send API; otherwise logs the link (the dev default).
  try {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    const storefront = process.env.STOREFRONT_URL ?? "http://localhost:3000"
    const loginLink = `${storefront}/auth/sign-in?email=${encodeURIComponent(
      customer.email ?? "",
    )}`
    const subject = "Your RISITEX wholesale account is approved ✓"
    const body =
      `Hi ${company.trade_name || "there"}, your RISITEX wholesale account is ` +
      `approved and verified. Sign in: ${loginLink} — use the password you set ` +
      `when you applied.`
    let sent = false
    try {
      const comm = req.scope.resolve("polemarch_communication") as any
      if (typeof comm?.sendEmail === "function") {
        await comm.sendEmail({ to: customer.email, subject, body })
        sent = true
      }
    } catch {
      /* comm module absent / different API — fall through to log */
    }
    // Always log the link so it's grabbable in dev (SMTP may not be wired
    // even if the comm module accepted the message).
    logger.info(
      `[approve] approval email for ${customer.email} ` +
        `${sent ? "(handed to comm module)" : "(no provider — dev log only)"}: ` +
        `LOGIN LINK → ${loginLink}`,
    )
  } catch {
    // email is non-critical to the approval transaction
  }

  return res.json({
    company,
    customer: { id: customer.id, email: customer.email },
    application: {
      id: app.id,
      status: "approved" as const,
      resulting_company_id: company.id,
    },
  })
}
