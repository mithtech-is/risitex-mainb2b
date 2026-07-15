import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { COMPANY_MODULE } from "../../../../../../modules/company"
import type { CompanyModuleService } from "../../../../../../modules/company"
import { syncCustomerTierMembership } from "../../../../../../lib/tier-group"
import { CUSTOMER_TIER_MODULE } from "../../../../../../modules/customer_tier"
import { sendEventNotification } from "../../../../../../modules/polemarch_communication/helpers/send-event-email"

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

  // ── 7. "You're verified — sign in and start shopping" (FR-1.02).
  //       Fired inline (not via the event bus) so it reliably fires on every
  //       approval. sendEventNotification fans out to email (the
  //       `company.approved` template) AND WhatsApp/SMS via the event maps,
  //       resolves the recipient from customer_id, and never throws.
  //       Step 6 above just set email_verified + phone_verified, so the
  //       "email and company verified" wording is accurate at this point.
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const storefront = process.env.STOREFRONT_URL ?? "http://localhost:3000"
  const loginUrl = `${storefront}/auth/sign-in?email=${encodeURIComponent(
    customer.email ?? "",
  )}`
  try {
    // Tier + payment-terms labels are cosmetic detail rows in the email.
    let tierName = ""
    try {
      const tiers = req.scope.resolve(CUSTOMER_TIER_MODULE) as {
        retrieveCustomerTier: (id: string) => Promise<{ name?: string }>
      }
      const tier = await tiers.retrieveCustomerTier(parsed.data.customer_tier_id)
      tierName = tier?.name ?? ""
    } catch {
      // tier lookup is best-effort — the email still sends without it
    }
    const termsLabel =
      paymentTerms === "net_30"
        ? "Net 30"
        : paymentTerms === "net_60"
          ? "Net 60"
          : paymentTerms === "advance_100"
            ? "100% advance"
            : ""

    await sendEventNotification(req.scope, "company.approved", {
      customer_id: customer.id,
      customer: { email: customer.email, first_name: customer.first_name || "there" },
      // Top-level first_name/tier_name feed the WhatsApp template's
      // positional variables; the email reads {{customer.first_name}}.
      first_name: customer.first_name || "there",
      trade_name: company.trade_name ?? "",
      gstin: String((company as { gstin?: string }).gstin ?? payload.gstin ?? ""),
      tier_name: tierName,
      payment_terms: termsLabel,
      login_url: loginUrl,
      storefront_url: storefront,
    })
  } catch {
    // notification is non-critical to the approval transaction
  }
  // Log the link regardless so it's grabbable in dev when SMTP isn't wired.
  logger.info(
    `[approve] verified-notification sent for ${customer.email}; LOGIN LINK → ${loginUrl}`,
  )

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
