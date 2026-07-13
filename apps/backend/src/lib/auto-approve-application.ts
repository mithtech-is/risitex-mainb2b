import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { COMPANY_MODULE } from "../modules/company"
import type { CompanyModuleService } from "../modules/company"
import { CASHFREE_WALLET_MODULE } from "../modules/cashfree_wallet"
import { syncCustomerTierMembership } from "./tier-group"

/**
 * Self-service auto-approval (FR-1.02b / B2B onboarding spec).
 *
 * Called from BOTH /store/auth/email-otp/verify AND
 * /store/auth/phone-otp/verify. Only flips the customer to "approved"
 * once BOTH email_verified AND phone_verified are true on the customer
 * metadata — the OTP route stamps its respective flag immediately
 * before calling here, so the second one in wins.
 *
 * What approval does, in order:
 *   1. Idempotency guard — return early if already linked to a company.
 *   2. Verification gate — return early if either flag is still false.
 *   3. Find the most recent pending application matching the email.
 *   4. Mint a `company` row (companies.approveApplication).
 *   5. Stamp company_id, customer_tier_id, payment_terms on customer
 *      (raw SQL — those columns live on customer but Medusa's
 *      CustomerService doesn't know about them).
 *   6. Stamp `b2b_active = true` + `b2b_approved_at` into customer metadata.
 *   7. Create default billing + shipping addresses from the application's
 *      billing_address (idempotent — skipped if customer already has any
 *      addresses).
 *   8. Provision a cashfree wallet (ensureWallet is idempotent).
 *   9. Add customer to the tier's native customer-group for price-list
 *      eligibility.
 *
 * Default tier: the entry "local_mbo" tier; falls back to whatever's first.
 *
 * Best-effort: any internal failure is swallowed and logged — the OTP
 * verification itself stays successful. Ops can retry approval manually
 * from the admin if this didn't land.
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
      raw: (sql: string, bindings?: unknown[]) => Promise<any>
    }

    // ── 1. Idempotency: if already linked, ensure wallet + addresses
    //    + tier membership but skip everything else. This is the path
    //    when the SECOND verify route fires after both flags are set.
    const currentCustomer = await customerService
      .retrieveCustomer(customer_id)
      .catch(() => null)
    const meta = (currentCustomer?.metadata ?? {}) as Record<string, unknown>

    const rows = (await pgConn.raw(
      `SELECT company_id FROM customer WHERE id = ? LIMIT 1`,
      [customer_id],
    )) as { rows?: Array<{ company_id: string | null }> }
    const linkedCompanyId =
      rows?.rows?.[0]?.company_id ??
      (meta.company_id as string | undefined) ??
      null
    if (linkedCompanyId) {
      // Top up downstream provisioning best-effort and exit. Try to
      // fetch the company so the side-effects path can mirror its
      // billing_address into a customer address if one isn't there yet.
      let existingCompany: { billing_address?: Record<string, unknown> | null } | null = null
      try {
        existingCompany = await companies.retrieveCompany(linkedCompanyId)
      } catch {
        /* ignore — side-effects will simply skip address creation */
      }
      void ensureSideEffects(scope, customer_id, existingCompany, logger)
      return { approved: false, alreadyApproved: true, company_id: linkedCompanyId }
    }

    // ── 2. Verification gate — require BOTH email and phone.
    const emailVerified = meta.email_verified === true
    const phoneVerified = meta.phone_verified === true
    if (!emailVerified || !phoneVerified) {
      return {
        approved: false,
        reason: !emailVerified ? "awaiting_email_verification" : "awaiting_phone_verification",
      }
    }

    // ── 3. Find pending application for this email.
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

    // ── 4. Pick default tier.
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

    // ── 5. Approve the application (mints the company row).
    const company = await companies.approveApplication({
      application_id: app.id,
      reviewer_id: "system:dual-otp",
      customer_tier_id: defaultTier.id,
      review_notes: "Auto-approved on email + phone OTP verification",
    })

    // ── 6. Stamp B2B FK columns on customer + b2b_active = true in metadata.
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
    try {
      const fresh = await customerService.retrieveCustomer(customer_id)
      await customerService.updateCustomers(customer_id, {
        metadata: {
          ...(fresh.metadata ?? {}),
          company_id: company.id,
          b2b_active: true,
          b2b_approved_at: new Date().toISOString(),
          b2b_approval_source: "dual_otp_auto",
        },
      })
    } catch {
      /* non-critical */
    }

    // ── 7-9. Default addresses + wallet + tier membership (all idempotent).
    //    Pass the freshly-minted company so its billing_address (mirrored
    //    from the application payload during approveApplication) can be
    //    materialised into the customer's default address.
    await ensureSideEffects(scope, customer_id, company, logger)

    logger?.info(
      `[auto-approve] activated customer ${customer_id} -> company ${company.id} (tier ${defaultTier.code})`,
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

/**
 * Side-effects we want to run whether the approval is fresh OR the
 * customer was already approved (the second OTP-verify always lands
 * here so this is the catch-up path for incomplete prior approvals).
 *
 * All steps are idempotent; failures log but never throw.
 */
async function ensureSideEffects(
  scope: { resolve: (key: string | symbol) => any },
  customer_id: string,
  addressSource: { billing_address?: Record<string, unknown> | null } | null,
  logger: any,
): Promise<void> {
  // Wallet — idempotent ensureWallet returns existing or creates fresh.
  try {
    const wallets = scope.resolve(CASHFREE_WALLET_MODULE) as {
      ensureWallet: (id: string) => Promise<unknown>
    }
    await wallets.ensureWallet(customer_id)
  } catch (e) {
    logger?.warn(
      `[auto-approve] wallet provisioning failed for ${customer_id}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  }

  // Default addresses — only create if the customer has none yet.
  try {
    const customerService = scope.resolve(Modules.CUSTOMER) as any
    const existingAddrs = await customerService
      .listCustomerAddresses({ customer_id }, { take: 1 })
      .catch(() => [])
    if ((existingAddrs?.length ?? 0) === 0 && addressSource?.billing_address) {
      const addr = addressSource.billing_address as Record<string, any>
      const customer = await customerService.retrieveCustomer(customer_id).catch(() => null)
      const meta = (customer?.metadata ?? {}) as Record<string, any>
      const firstName =
        (meta.first_name as string) ??
        (customer?.first_name as string) ??
        (meta.owner_name as string) ??
        ""
      const lastName =
        (meta.last_name as string) ??
        (customer?.last_name as string) ??
        ""
      const phone = (customer?.phone as string) ?? ""
      const company =
        (meta.trade_name as string) ??
        (meta.company_name as string) ??
        ""

      const base = {
        customer_id,
        address_name: "Primary",
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        company: company || undefined,
        phone: phone || undefined,
        address_1: (addr.line1 as string) ?? "",
        address_2: (addr.line2 as string) ?? undefined,
        city: (addr.city as string) ?? "",
        province: (addr.state as string) ?? undefined,
        postal_code: (addr.postal_code as string) ?? "",
        country_code:
          ((addr.country_code as string) ?? "in").toLowerCase(),
      }
      await customerService.createCustomerAddresses([
        { ...base, is_default_billing: true, is_default_shipping: true },
      ])
    }
  } catch (e) {
    logger?.warn(
      `[auto-approve] default-address creation failed for ${customer_id}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  }

  // Tier-group membership — required for price-list eligibility.
  try {
    const pg = scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
      raw: (sql: string, b?: unknown[]) => Promise<any>
    }
    const tierRow = await pg.raw(
      `SELECT customer_tier_id FROM customer WHERE id = ? LIMIT 1`,
      [customer_id],
    )
    const tierId = tierRow?.rows?.[0]?.customer_tier_id as string | null
    if (tierId) {
      await syncCustomerTierMembership(scope, customer_id, tierId)
    }
  } catch {
    /* admin can backfill via /admin/b2b-sales/sync-tier-groups */
  }
}
