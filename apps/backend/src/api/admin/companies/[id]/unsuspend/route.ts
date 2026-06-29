import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { COMPANY_MODULE } from "../../../../../modules/company"
import type { CompanyModuleService } from "../../../../../modules/company"

/**
 * POST /admin/companies/:id/unsuspend — reverses a prior suspend.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = req.params.id
  const companies = req.scope.resolve<CompanyModuleService>(COMPANY_MODULE)
  try {
    const updated = await companies.unsuspendCompany({ company_id: id })
    return res.json({ company: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (/only suspended/i.test(msg)) {
      return res.status(409).json({ message: msg })
    }
    if (/not found/i.test(msg)) {
      return res.status(404).json({ message: msg })
    }
    return res.status(500).json({ message: msg })
  }
}
