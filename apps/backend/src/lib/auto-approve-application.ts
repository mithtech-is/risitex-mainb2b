import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { COMPANY_MODULE } from "../modules/company"
import type { CompanyModuleService } from "../modules/company"
import { syncCustomerTierMembership } from "./tier-group"

/**
 * Self-service auto-approval (FR-1.02b).
 *
 * Called from /store/auth/email-otp/verify. When the customer who just
 * verified their email has a pending company application matching their
 * email address, this function:
 *
 *   1. Approves the application (mints a `company` row at status='approved')
 *   2. Links customer.company_id, customer.customer_tier_id, payment_terms
 *      via raw SQL (Medusa's CustomerService doesn't know about these cols).
 *   3. Adds the customer to the tier's native customer-group so price lists
 *      apply at checkout.
 *
 * Default tier: the cheapest entry-tier on file (advance-payment). Ops can
 * later re-tier the customer via the admin without redoing approval.
 *
 * Idempotent: returns `{ alreadyApproved: true }` if the customer already
 * has a company_id; returns `null` if no pending application exists.
 *
 * Best-effort: any failure inside this function is swallowed and logged —
 * the OTP verification itself stays successful. Ops can retry approval
 * manually from the admin if auto-approve fails.
 */
export async function autoApproveIfPending(
  scope: { resolve: (key: string | symbol) => any },
  args: { customer_id: string; email: string; logger?: any },
): Promise<{
  approved: boolean
  alreadyApproved?: boolean
  application_id?: string
  company_id?: string
  reason?: string
}> {
  const { customer_id, email } = args
  const logger =
    args.logger ?? scope.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    const companies = scope.resolve(COMPANY_MODULE) as CompanyModuleService
    const customerService = scope.resolve(Modules.CUSTOMER) as any
    const pgConn = scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
      raw: (sql: string, bindings?: unknown[]) => Promise<unknown>
    }

    // If the customer is already linked to a company, nothing to do.
    const currentCustomer = await customerService
      .retrieveCustomer(customer_id)
      .catch(() => null)
    const currentCompanyId =
      (currentCustomer?.metadata?.company_id as string | undefined) ?? null
    // The raw column lives on customer too; check it via SQL to avoid a
    // second graph query.
    const rows = (await pgConn.raw(
      `SELECT company_id FROM customer WHERE id = ? LIMIT 1`,
      [customer_id],
    )) as { rows?: Array<{ company_id: string | null }> }
    const linkedCompanyId = rows?.rows?.[0]?.company_id ?? currentCompanyId
    if (linkedCompanyId) {
      return { approved: false, alreadyApproved: true, company_id: linkedCompanyId }
    }

    // Find the most recent pending application for this email.
    const apps = await companies.listCompanyApplications(
      { applicant_email: email },
      { order: { created_at: "DESC" }, take: 1 },
    )
    const app = apps?.[0]
    if (!app) {
      return { approved: false, reason: "no_application" }
    }
    if (app.status !== "pending") {
      return {
        approved: false,
        reason: `application_${app.status}`,
        application_id: app.id,
      }
    }

    // Pick the default entry tier (advance payment). Falls back to
    // whatever the first tier in the DB is if `local_mbo` isn't present.
    const { data: tiers } = await scope
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({
        entity: "customer_tier",
        fields: ["id", "code", "name", "default_payment_terms"],
        filters: {},
      })
    const allTiers = (tiers ?? []) as Array<{
      id: string
      code: string
      default_payment_terms?: string | null
    }>
    const defaultTier =
      allTiers.find((t) => t.code === "local_mbo") ?? allTiers[0]
    if (!defaultTier) {
      logger?.warn(
        "[auto-approve] no customer_tier rows seeded — leaving application pending",
      )
      return { approved: false, reason: "no_tier_seeded", application_id: app.id }
    }

    // 1. Approve the application — mints the company row.
    const company = await companies.approveApplication({
      application_id: app.id,
      reviewer_id: "system:email-otp",
      customer_tier_id: defaultTier.id,
      sales_rep_id: null,
      review_notes: "Auto-approved on email OTP verification",
    })

    // 2. Stamp the B2B FK columns onto the customer row.
    const paymentTerms = defaultTier.default_payment_terms ?? null
    await pgConn.raw(
      `UPDATE customer
         SET company_id = ?,
             customer_tier_id = ?,
             payment_terms = COALESCE(?, payment_terms),
             updated_at = now()
       WHERE id = ?`,
      [company.id, defaultTier.id, paymentTerms, customer_id],
    )

    // Also mirror the company_id into metadata so the storefront
    // /store/companies/me endpoint surfaces it without a second query.
    try {
      const fresh = await customerService.retrieveCustomer(customer_id)
      await customerService.updateCustomers(customer_id, {
        metadata: {
          ...(fresh.metadata ?? {}),
          company_id: company.id,
          b2b_approved_at: new Date().toISOString(),
          b2b_approval_source: "email_otp_auto",
        },
      })
    } catch {
      /* non-critical */
    }

    // 3. Add to tier's native customer-group (best-effort; never block on this).
    try {
      await syncCustomerTierMembership(scope, customer_id, defaultTier.id)
    } catch {
      /* run /admin/b2b-sales/sync-tier-groups to backfill */
    }

    logger?.info(
      `[auto-approve] customer ${customer_id} -> company ${company.id} (tier ${defaultTier.code})`,
    )
    return {
      approved: true,
      application_id: app.id,
      company_id: company.id,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger?.error(`[auto-approve] failed for customer ${customer_id}: ${msg}`)
    return { approved: false, reason: `error:${msg.slice(0, 80)}` }
  }
}
