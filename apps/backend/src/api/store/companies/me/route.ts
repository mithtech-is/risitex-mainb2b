import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { COMPANY_MODULE } from "../../../../modules/company"
import type { CompanyModuleService } from "../../../../modules/company"

/**
 * GET /store/companies/me  (FR-1.03)
 *
 * Resolve the authenticated customer's B2B context. Storefront calls
 * this on every page load to know which tier-aware prices to ask for,
 * whether to show the wholesale catalog gate, and what payment-terms
 * branch the checkout should take.
 *
 * Returns:
 *   { authenticated: false }   — no auth context
 *   { authenticated: true, b2b: null }   — no approved company yet
 *   { authenticated: true, b2b: {
 *       company: { id, gstin, trade_name, status,
 *                  billing_address, customer_tier_id, sales_rep_id },
 *       customer_tier: { id, code, name } | null,
 *       payment_terms: string | null,
 *     } }
 *
 * Tier resolution: looks up customer.customer_tier_id first (per-MBO
 * override), then falls back to company.customer_tier_id.
 *
 * No need to hit company.status — by the time customer.company_id is
 * set, the application has been approved. If ops later suspends the
 * company, we return the company row with its current status and
 * let the storefront gate on `b2b.company.status === 'approved'`.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as unknown as {
    auth_context?: { app_metadata?: { customer_id?: string } }
  }).auth_context?.app_metadata?.customer_id

  if (!customerId) {
    return res.json({ authenticated: false })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: [
      "id",
      "email",
      "first_name",
      "last_name",
      "phone",
      "metadata",
      "company_id",
      "customer_tier_id",
      "payment_terms",
    ],
    filters: { id: customerId },
  })
  const customer = customers?.[0] as
    | {
        id: string
        email: string
        first_name: string | null
        last_name: string | null
        phone: string | null
        metadata: Record<string, unknown> | null
        company_id: string | null
        customer_tier_id: string | null
        payment_terms: string | null
      }
    | undefined

  if (!customer) {
    return res.json({ authenticated: true, b2b: null })
  }

  const companies = req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)

  // FALLBACK: customer.company_id / customer_tier_id / payment_terms are
  // raw-SQL-added columns (see migrations/2026-06-15_customer-b2b-fields.sql).
  // Medusa's CustomerModel schema doesn't know about them, so query.graph
  // returns null for those fields even when the DB row is populated (e.g.
  // after admin approval or autoApproveIfPending). Always raw-read them
  // when graph came back empty so the B2B context resolves correctly.
  let resolvedCompanyId: string | null = customer.company_id
  let resolvedTierId: string | null = customer.customer_tier_id
  let resolvedPaymentTerms: string | null = customer.payment_terms
  if (!resolvedCompanyId || !resolvedTierId || !resolvedPaymentTerms) {
    try {
      const pgConn = req.scope.resolve(
        ContainerRegistrationKeys.PG_CONNECTION,
      ) as { raw: (sql: string, b?: unknown[]) => Promise<unknown> }
      const result = (await pgConn.raw(
        `SELECT company_id, customer_tier_id, payment_terms FROM customer WHERE id = ? LIMIT 1`,
        [customer.id],
      )) as {
        rows?: Array<{
          company_id: string | null
          customer_tier_id: string | null
          payment_terms: string | null
        }>
      }
      const row = result?.rows?.[0]
      if (row) {
        resolvedCompanyId = row.company_id ?? resolvedCompanyId
        resolvedTierId = row.customer_tier_id ?? resolvedTierId
        resolvedPaymentTerms = row.payment_terms ?? resolvedPaymentTerms
      }
    } catch {
      // best-effort — falls through to metadata fallback then no-company branch
    }
  }
  // Final fallback for the company id only: the auto-approve helper mirrors
  // it into customer.metadata.company_id, which is also useful when the raw
  // SQL above is unavailable in test/lambda environments.
  if (!resolvedCompanyId) {
    const metaCompanyId = (customer.metadata as Record<string, unknown> | null)
      ?.company_id
    if (typeof metaCompanyId === "string" && metaCompanyId.length > 0) {
      resolvedCompanyId = metaCompanyId
    }
  }

  if (!resolvedCompanyId) {
    // No company yet: either the customer has not applied, or a wholesale
    // applicant is still awaiting (or rejected at) review. Surface the latest
    // application + ALL of the signup-time customer metadata so the Company
    // Details / Profile pages render real data immediately instead of
    // "Not Available" placeholders. The Company link replaces this scaffolding
    // when ops finalises the approval.
    let application:
      | {
          status: string
          trade_name: string | null
          gstin: string | null
          applicant_email: string | null
          applicant_phone: string | null
          contact_name: string | null
          billing_address: Record<string, unknown> | null
        }
      | null = null
    try {
      const apps = await companies.listCompanyApplications(
        { applicant_email: customer.email },
        { order: { created_at: "DESC" }, take: 1 },
      )
      if (apps?.[0]) {
        const a = apps[0] as unknown as {
          status: string
          trade_name: string | null
          gstin: string | null
          applicant_email: string | null
          applicant_phone: string | null
          contact_name: string | null
          billing_address: Record<string, unknown> | null
        }
        application = {
          status: a.status,
          trade_name: a.trade_name ?? null,
          gstin: a.gstin ?? null,
          applicant_email: a.applicant_email ?? null,
          applicant_phone: a.applicant_phone ?? null,
          contact_name: a.contact_name ?? null,
          billing_address: a.billing_address ?? null,
        }
      }
    } catch {
      // best-effort — never fail the context resolution over this
    }
    return res.json({
      authenticated: true,
      customer: {
        id: customer.id,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        metadata: customer.metadata ?? null,
      },
      b2b: null,
      application,
    })
  }

  const company = await companies
    .retrieveCompany(resolvedCompanyId)
    .catch(() => null)

  if (!company) {
    return res.json({
      authenticated: true,
      customer: { id: customer.id, email: customer.email },
      b2b: null,
    })
  }

  // Tier resolution: per-customer override wins, else company default.
  const tierId = resolvedTierId ?? company.customer_tier_id ?? null
  let tier: { id: string; code: string; name: string } | null = null
  if (tierId) {
    const { data: tiers } = await query.graph({
      entity: "customer_tier",
      fields: ["id", "code", "name", "default_payment_terms"],
      filters: { id: tierId },
    })
    const t = tiers?.[0] as
      | { id: string; code: string; name: string; default_payment_terms: string }
      | undefined
    if (t) tier = { id: t.id, code: t.code, name: t.name }
  }

  return res.json({
    authenticated: true,
    customer: {
      id: customer.id,
      email: customer.email,
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      metadata: customer.metadata ?? null,
    },
    b2b: {
      company: {
        id: company.id,
        gstin: company.gstin,
        trade_name: company.trade_name,
        status: company.status,
        billing_address: company.billing_address,
        customer_tier_id: tierId,
      },
      customer_tier: tier,
      payment_terms: resolvedPaymentTerms ?? null,
    },
  })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as unknown as {
    auth_context?: { app_metadata?: { customer_id?: string } }
  }).auth_context?.app_metadata?.customer_id;

  if (!customerId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "company_id", "metadata"],
    filters: { id: customerId },
  });

  const customer = customers?.[0] as any;
  if (!customer) {
    return res.status(404).json({ success: false, message: "Customer not found" });
  }

  const body = (req.validatedBody || req.body || {}) as Record<string, any>;

  // Mirror the buyer-edited fields onto the CUSTOMER row too, so the admin's
  // customer detail view (native company_name) and any GSTIN-derived logic
  // stay in sync with the company record — not just the company.
  try {
    const customerModule = req.scope.resolve(Modules.CUSTOMER) as any;
    const nextMeta: Record<string, unknown> = {
      ...((customer.metadata as Record<string, unknown> | null) ?? {}),
    };
    if (body.gstin !== undefined) nextMeta.gstin = body.gstin;
    if (body.company_name !== undefined) nextMeta.company_name = body.company_name;
    if (body.trade_name !== undefined) nextMeta.trade_name = body.trade_name;

    const customerUpdate: Record<string, unknown> = { metadata: nextMeta };
    if (typeof body.company_name === "string" && body.company_name.length > 0) {
      customerUpdate.company_name = body.company_name;
    }
    if (typeof body.phone === "string" && body.phone.length > 0) {
      customerUpdate.phone = body.phone;
    }
    await customerModule.updateCustomers(customerId, customerUpdate);
  } catch (e) {
    console.error("Failed to sync customer record", e);
  }

  let resolvedCompanyId = customer.company_id;
  if (!resolvedCompanyId) {
    try {
      const pgConn = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
      const result = await pgConn.raw(`SELECT company_id FROM customer WHERE id = ? LIMIT 1`, [customer.id]);
      resolvedCompanyId = result?.rows?.[0]?.company_id;
    } catch {}
  }
  if (!resolvedCompanyId) {
    const metaCompanyId = customer.metadata?.company_id;
    if (typeof metaCompanyId === "string" && metaCompanyId.length > 0) {
      resolvedCompanyId = metaCompanyId;
    }
  }

  if (resolvedCompanyId) {
    const companies = req.scope.resolve<CompanyModuleService>(COMPANY_MODULE);
    try {
      const updateData: any = { id: resolvedCompanyId };
      if (body.gstin !== undefined) updateData.gstin = body.gstin;
      if (body.trade_name !== undefined) updateData.trade_name = body.trade_name;
      if (body.email !== undefined) updateData.applicant_email = body.email;
      if (body.billing_address !== undefined) updateData.billing_address = body.billing_address;

      await companies.updateCompanies(updateData);
    } catch (e) {
      console.error("Failed to sync company", e);
    }
  }

  return res.json({ success: true });
}
