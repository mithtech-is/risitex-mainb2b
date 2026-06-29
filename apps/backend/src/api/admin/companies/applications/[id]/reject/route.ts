import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { COMPANY_MODULE } from "../../../../../../modules/company"
import type { CompanyModuleService } from "../../../../../../modules/company"

/**
 * POST /admin/companies/applications/:id/reject
 *
 * Marks a pending application rejected with a required reason.
 * Idempotent: rejecting an already-rejected application is a 409.
 */
const BodySchema = z.object({
  review_notes: z.string().trim().min(3).max(2000),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const applicationId = req.params.id
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: "review_notes is required (3-2000 chars)",
      errors: parsed.error.flatten(),
    })
  }
  const reviewerId =
    (req as unknown as { auth_context?: { actor_id?: string } })
      .auth_context?.actor_id ?? "system"
  const companies = req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)
  try {
    const updated = await companies.rejectApplication({
      application_id: applicationId,
      reviewer_id: reviewerId,
      review_notes: parsed.data.review_notes,
    })
    return res.json({ application: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (/only pending/i.test(msg)) {
      return res.status(409).json({ message: msg })
    }
    if (/not found/i.test(msg)) {
      return res.status(404).json({ message: msg })
    }
    return res.status(500).json({ message: msg })
  }
}
