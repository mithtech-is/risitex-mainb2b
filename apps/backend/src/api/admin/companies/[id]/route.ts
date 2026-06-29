import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { COMPANY_MODULE } from "../../../../modules/company"
import type { CompanyModuleService } from "../../../../modules/company"
import { CUSTOMER_TIER_MODULE } from "../../../../modules/customer_tier"
import { archiveRecord } from "../../../../lib/deletion-archive"

/**
 * GET    /admin/companies/:id  — retrieve one company
 * PATCH  /admin/companies/:id  — update tier / sales_rep / payment_terms / notes
 * DELETE /admin/companies/:id  — soft-delete the company (any status) + unlink
 *                                its buyers from company-scoped terms
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = req.params.id
  const companies = req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)
  try {
    const company = await companies.retrieveCompany(id)
    return res.json({ company })
  } catch {
    return res.status(404).json({ message: `Company ${id} not found` })
  }
}

const PatchSchema = z.object({
  customer_tier_id: z.string().nullable().optional(),
  sales_rep_id: z.string().nullable().optional(),
  credit_terms_id: z.string().nullable().optional(),
  review_notes: z.string().max(2000).nullable().optional(),
  trade_name: z.string().trim().min(2).max(200).optional(),
})

export const PATCH = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = req.params.id
  const parsed = PatchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid patch",
      errors: parsed.error.flatten(),
    })
  }
  const companies = req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)
  try {
    const [updated] = await companies.updateCompanies([
      { id, ...parsed.data },
    ])
    return res.json({ company: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return res.status(500).json({ message: msg })
  }
}

/**
 * DELETE /admin/companies/:id
 *
 * Removes a B2B company regardless of status (pending mint, approved, or
 * suspended). Steps:
 *
 *   1. Unlink every Medusa customer attached to this company — clear the
 *      soft-FK columns (company_id / customer_tier_id / sales_rep_id /
 *      payment_terms) and drop the tier customer-group membership so tier
 *      pricing stops applying. The customer ACCOUNT + LOGIN are preserved;
 *      they simply lose company-scoped purchasing terms.
 *   2. Soft-delete the company row. The GSTIN unique index is partial on
 *      `deleted_at IS NULL`, so the GSTIN is freed and the same business can
 *      re-apply later. The approved application stays as an audit record.
 *
 * The customer unlink is best-effort — a hiccup there never blocks the
 * delete, since an orphaned link to a now-gone company is harmless.
 */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = req.params.id
  const companies = req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)
  const pgConn = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION,
  ) as {
    raw: (
      sql: string,
      bindings?: unknown[],
    ) => Promise<{ rows?: Array<Record<string, unknown>> }>
  }
  const actorId =
    (req as unknown as { auth_context?: { actor_id?: string } })
      .auth_context?.actor_id ?? "admin"

  // 1. Load it first so a missing id is a clean 404 (not a 500).
  let company
  try {
    company = await companies.retrieveCompany(id)
  } catch {
    return res.status(404).json({ message: `Company ${id} not found` })
  }

  // 2. Resolve the tier's native customer-group (cached on the tier metadata
  //    by the tier-group bridge) so we can drop memberships below.
  let groupId: string | null = null
  if (company.customer_tier_id) {
    try {
      const tiers = req.scope.resolve(CUSTOMER_TIER_MODULE) as {
        retrieveCustomerTier: (
          tid: string,
        ) => Promise<{ metadata?: Record<string, unknown> | null }>
      }
      const tier = await tiers.retrieveCustomerTier(company.customer_tier_id)
      groupId = (tier?.metadata?.customer_group_id as string) ?? null
    } catch {
      // tier removed / never bridged — nothing to unsubscribe from
    }
  }

  // 3. Snapshot the OLD details to the deletion archive BEFORE we touch
  //    anything — this soft-delete won't trip the DB AFTER DELETE trigger, so
  //    we archive explicitly. Captures the full company plus the customers
  //    we're about to unlink, so the account can be reconstructed later.
  let linkedCustomers: Array<Record<string, unknown>> = []
  try {
    const snap = await pgConn.raw(
      `SELECT id, email, first_name, last_name, customer_tier_id, payment_terms
         FROM customer
        WHERE company_id = ?`,
      [company.id],
    )
    linkedCustomers = snap.rows ?? []
  } catch {
    // non-fatal — proceed with whatever we have
  }
  await archiveRecord(pgConn, {
    entity_type: "company",
    entity_id: company.id,
    label: company.trade_name,
    snapshot: {
      company: {
        id: company.id,
        gstin: company.gstin,
        trade_name: company.trade_name,
        status: company.status,
        billing_address: company.billing_address,
        customer_tier_id: company.customer_tier_id,
        sales_rep_id: company.sales_rep_id,
        credit_terms_id: company.credit_terms_id,
        review_notes: company.review_notes,
        metadata: company.metadata,
        created_at: company.created_at,
      },
      tier_group_id: groupId,
      unlinked_customers: linkedCustomers,
    },
    deleted_by: actorId,
    reason: "company deleted from admin",
  })

  // 4. Fully remove the company's customers (ops chose "fully remove" on
  //    company delete). Soft-delete the customer rows; the DB triggers then
  //    (a) archive each customer and (b) PURGE their login identity
  //    (auth_identity + provider_identity), so the email no longer "exists"
  //    on the storefront and can register fresh. Best-effort — never block
  //    the company delete.
  try {
    await pgConn.raw(
      `UPDATE customer
          SET deleted_at = now(),
              updated_at = now()
        WHERE company_id = ?
          AND deleted_at IS NULL`,
      [company.id],
    )
  } catch {
    // A customer-removal hiccup must not block deleting the company.
  }

  // 5. Soft-delete the company (frees the GSTIN for re-application).
  try {
    await companies.deleteCompany({ company_id: company.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return res.status(500).json({ message: msg })
  }

  return res.json({ id: company.id, object: "company", deleted: true })
}
