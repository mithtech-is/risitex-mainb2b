import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import { Company } from "./models/company"
import { CompanyApplication } from "./models/company-application"

/**
 * Indian GSTIN canonical regex.
 *
 *   <state-code><pan-of-entity><entity-number><Z><check-digit>
 *     2 digits    10 alnum       1 alnum       1   1 alnum
 *
 * State code is 01-37 (no validation of the upper bound here — that
 * would change every time GoI announces a new UT; an invalid state
 * code still costs us nothing because the check digit catches it).
 * Lower-case input is allowed; we normalise to upper-case before
 * validating and persisting.
 */
const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/

export type CompanyApplicationPayload = {
  gstin: string
  trade_name: string
  applicant_email: string
  applicant_phone?: string | null
  billing_address: {
    line1: string
    line2?: string | null
    city: string
    state: string
    postal_code: string
    country_code: string
  }
  contact_name?: string | null
}

class CompanyModuleService extends MedusaService({
  Company,
  CompanyApplication,
}) {
  /**
   * Validate + persist an open intake (FR-1.02). Throws MedusaError
   * (INVALID_DATA / CONFLICT) on bad shape or duplicate GSTIN.
   *
   * `ip_hash` is sha256 of the submitter's IP — never persist raw
   * IPs (DPDP §8 minimization).
   */
  async submitApplication(input: {
    payload: CompanyApplicationPayload
    ip_hash?: string | null
  }) {
    const gstin = (input.payload.gstin ?? "").toUpperCase()
    if (!GSTIN_REGEX.test(gstin)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `GSTIN "${input.payload.gstin}" is not a valid Indian GSTIN.`,
      )
    }

    // Duplicate guard: a pending OR approved company with the same
    // GSTIN blocks new applications. A previously rejected app does
    // not block — operator may have been wrong; let them re-apply.
    const existingCompanies = await this.listCompanies({ gstin })
    if (existingCompanies.length > 0) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        `A company with GSTIN ${gstin} already exists (status: ${existingCompanies[0]!.status}).`,
      )
    }

    const pendingApps = await this.listCompanyApplications({
      gstin,
      status: "pending",
    })
    if (pendingApps.length > 0) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        `A pending application for GSTIN ${gstin} is already under review.`,
      )
    }

    const [app] = await this.createCompanyApplications([
      {
        gstin,
        trade_name: input.payload.trade_name.trim(),
        applicant_email: input.payload.applicant_email.trim().toLowerCase(),
        applicant_phone: input.payload.applicant_phone?.trim() || null,
        payload: input.payload as unknown as Record<string, unknown>,
        status: "pending",
        ip_hash: input.ip_hash ?? null,
      },
    ])
    return app
  }

  /**
   * Promote a pending application to an approved company. Returns
   * the new company row. Caller (admin/companies/[id]/approve route)
   * is responsible for creating the matching Medusa customer and
   * linking customer.company_id.
   */
  async approveApplication(input: {
    application_id: string
    reviewer_id: string
    customer_tier_id?: string | null
    sales_rep_id?: string | null
    review_notes?: string | null
  }) {
    const app = await this.retrieveCompanyApplication(input.application_id)
    if (app.status !== "pending") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Application ${app.id} is ${app.status}; only pending applications can be approved.`,
      )
    }

    const payload = app.payload as unknown as CompanyApplicationPayload

    const [company] = await this.createCompanies([
      {
        gstin: app.gstin,
        trade_name: app.trade_name,
        billing_address: payload.billing_address as unknown as Record<string, unknown>,
        status: "approved",
        customer_tier_id: input.customer_tier_id ?? null,
        sales_rep_id: input.sales_rep_id ?? null,
        review_notes: input.review_notes ?? null,
        metadata: {
          applicant_email: app.applicant_email,
          applicant_phone: app.applicant_phone,
          application_id: app.id,
        },
      },
    ])

    await this.updateCompanyApplications([
      {
        id: app.id,
        status: "approved",
        reviewer_id: input.reviewer_id,
        review_notes: input.review_notes ?? null,
        reviewed_at: new Date(),
        resulting_company_id: company.id,
      },
    ])
    return company
  }

  async rejectApplication(input: {
    application_id: string
    reviewer_id: string
    review_notes: string
  }) {
    const app = await this.retrieveCompanyApplication(input.application_id)
    if (app.status !== "pending") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Application ${app.id} is ${app.status}; only pending applications can be rejected.`,
      )
    }
    const [updated] = await this.updateCompanyApplications([
      {
        id: app.id,
        status: "rejected",
        reviewer_id: input.reviewer_id,
        review_notes: input.review_notes,
        reviewed_at: new Date(),
      },
    ])
    return updated
  }

  async suspendCompany(input: {
    company_id: string
    review_notes: string
  }) {
    const company = await this.retrieveCompany(input.company_id)
    if (company.status !== "approved") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Company ${company.id} is ${company.status}; only approved companies can be suspended.`,
      )
    }
    const [updated] = await this.updateCompanies([
      {
        id: company.id,
        status: "suspended",
        review_notes: input.review_notes,
      },
    ])
    return updated
  }

  async unsuspendCompany(input: { company_id: string }) {
    const company = await this.retrieveCompany(input.company_id)
    if (company.status !== "suspended") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Company ${company.id} is ${company.status}; only suspended companies can be unsuspended.`,
      )
    }
    const [updated] = await this.updateCompanies([
      {
        id: company.id,
        status: "approved",
      },
    ])
    return updated
  }

  /**
   * Soft-delete a company in ANY status (including approved/suspended).
   * Sets deleted_at; because the GSTIN unique index is partial on
   * `deleted_at IS NULL`, the GSTIN is freed for a fresh application and the
   * row drops out of the admin directory (list* excludes soft-deleted).
   *
   * The cross-module customer unlink (clearing customer.company_id / tier /
   * sales_rep / payment_terms and dropping the tier-group membership) is the
   * caller's job — done in the admin/companies/:id DELETE route, mirroring how
   * approveApplication leaves the customer-side stamping to the approve route.
   */
  async deleteCompany(input: { company_id: string }) {
    const company = await this.retrieveCompany(input.company_id)
    await this.softDeleteCompanies([company.id])
    return company
  }
}

export default CompanyModuleService
export { GSTIN_REGEX }
