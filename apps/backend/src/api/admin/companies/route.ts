import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { COMPANY_MODULE } from "../../../modules/company"
import type { CompanyModuleService } from "../../../modules/company"

/**
 * GET /admin/companies — list companies + applications.
 *
 * Query params:
 *   ?view=companies|applications     (default 'companies')
 *   ?status=pending|approved|rejected|suspended
 *   ?q=<text>                        free-text search (gstin OR trade_name OR applicant_email)
 *   ?limit=20&offset=0
 */
const QuerySchema = z.object({
  view: z.enum(["companies", "applications"]).default("companies"),
  status: z
    .enum(["pending", "approved", "rejected", "suspended"])
    .optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = QuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid query",
      errors: parsed.error.flatten(),
    })
  }
  const { view, status, q, limit, offset } = parsed.data
  const companies = req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)

  if (view === "applications") {
    const filters: Record<string, unknown> = {}
    if (status && status !== "suspended") filters.status = status
    const [rows, count] = await companies.listAndCountCompanyApplications(
      filters,
      { take: limit, skip: offset, order: { created_at: "DESC" } },
    )
    const filtered = q
      ? rows.filter((r) =>
          [r.gstin, r.trade_name, r.applicant_email]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q.toLowerCase())),
        )
      : rows

    // Annotate which approved applications now point at a DELETED company, so
    // the Applications tab shows "deleted" instead of a stale "approved".
    const coIds = filtered
      .map((r) => r.resulting_company_id)
      .filter((v): v is string => Boolean(v))
    let deletedCoIds = new Set<string>()
    if (coIds.length) {
      const cos = (await companies.listCompanies(
        { id: coIds },
        { withDeleted: true, select: ["id", "deleted_at"] },
      )) as Array<{ id: string; deleted_at: Date | null }>
      deletedCoIds = new Set(
        cos.filter((c) => c.deleted_at != null).map((c) => c.id),
      )
    }
    const annotated = filtered.map((r) => ({
      ...r,
      company_deleted: r.resulting_company_id
        ? deletedCoIds.has(r.resulting_company_id)
        : false,
    }))
    return res.json({
      view: "applications",
      count,
      applications: annotated,
    })
  }

  const filters: Record<string, unknown> = {}
  if (status) filters.status = status
  // withDeleted: keep soft-deleted companies in the list so a deleted company
  // shows (greyed, "deleted") in BOTH tabs instead of silently vanishing.
  const [rows, count] = await companies.listAndCountCompanies(filters, {
    take: limit,
    skip: offset,
    order: { created_at: "DESC" },
    withDeleted: true,
  })
  const filtered = q
    ? rows.filter((r) =>
        [r.gstin, r.trade_name, r.applicant_email]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q.toLowerCase())),
      )
    : rows
  return res.json({
    view: "companies",
    count,
    companies: filtered,
  })
}
