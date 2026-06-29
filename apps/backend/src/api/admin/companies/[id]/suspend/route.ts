import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { COMPANY_MODULE } from "../../../../../modules/company"
import type { CompanyModuleService } from "../../../../../modules/company"

/**
 * POST /admin/companies/:id/suspend
 *
 * Freezes the company. The storefront /store/companies/me endpoint
 * surfaces `b2b.company.status === 'suspended'`; the checkout
 * pipeline (Phase 4.5 subscriber) blocks order placement when the
 * resolved company is suspended.
 *
 * Requires a `review_notes` reason for the audit log.
 */
const BodySchema = z.object({
  review_notes: z.string().trim().min(3).max(2000),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = req.params.id
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "review_notes is required (3-2000 chars)",
      errors: parsed.error.flatten(),
    })
  }
  const companies = req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)
  try {
    const updated = await companies.suspendCompany({
      company_id: id,
      review_notes: parsed.data.review_notes,
    })
    return res.json({ company: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (/only approved/i.test(msg)) {
      return res.status(409).json({ message: msg })
    }
    if (/not found/i.test(msg)) {
      return res.status(404).json({ message: msg })
    }
    return res.status(500).json({ message: msg })
  }
}
