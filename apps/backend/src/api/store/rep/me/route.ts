import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  SALES_PERFORMANCE_MODULE,
  type SalesPerformanceModuleService,
} from "../../../../modules/sales_performance"

/**
 * GET /store/rep/me  (FR-7.04)
 *
 * The storefront rep dashboard's data source. Resolves the logged-in customer
 * to a SalesRep by EMAIL (a rep signs into the storefront with the same email
 * as their sales_rep record), then returns the rep's assigned companies and
 * commission totals. Returns { is_rep: false } when the caller isn't a rep.
 *
 * NOTE (assumption): rep identity = customer email === sales_rep.email. If reps
 * are instead admin users, swap the resolution accordingly.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId =
    (req as any).auth_context?.app_metadata?.customer_id ?? null
  if (!customerId) return res.status(401).json({ message: "Not authenticated" })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: { id: customerId },
  })
  const email = (customers?.[0] as { email?: string } | undefined)?.email
  if (!email) return res.json({ is_rep: false })

  const svc = req.scope.resolve<SalesPerformanceModuleService>(
    SALES_PERFORMANCE_MODULE,
  )
  const reps = await svc.listSalesReps({ email })
  const rep = reps?.[0]
  if (!rep || !rep.active) return res.json({ is_rep: false })

  // Active company assignments (valid_until null or in the future).
  const assignments = await svc.listSalesRepAssignments({
    sales_rep_id: rep.id,
  })
  const now = Date.now()
  const companyIds = assignments
    .filter(
      (a: any) =>
        a.company_id &&
        (!a.valid_until || new Date(a.valid_until).getTime() > now),
    )
    .map((a: any) => a.company_id as string)

  let companies: Array<{ id: string; name: string }> = []
  if (companyIds.length) {
    const { data: rows } = await query.graph({
      entity: "company",
      fields: ["id", "display_name", "legal_name"],
      filters: { id: companyIds },
    })
    companies = (rows ?? []).map((c: any) => ({
      id: c.id,
      name: c.display_name ?? c.legal_name ?? c.id,
    }))
  }

  // Commission totals by status.
  const records = await svc.listCommissionRecords({
    earner_type: "sales_rep",
    earner_id: rep.id,
  })
  let pending_minor = 0
  let paid_minor = 0
  for (const r of records as Array<{ status?: string; amount_minor?: unknown }>) {
    const amt = Number(r.amount_minor ?? 0)
    if (r.status === "paid") paid_minor += amt
    else if (r.status === "pending") pending_minor += amt
  }

  return res.json({
    is_rep: true,
    rep: { name: rep.name, email: rep.email },
    companies,
    commission: { pending_minor, paid_minor, currency_code: "inr" },
  })
}
