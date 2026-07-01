import { model } from "@medusajs/framework/utils"

/**
 * Raw B2B onboarding intake — the form payload posted to
 * /store/companies/apply (FR-1.02). One row per submission.
 *
 * Separate from `company` because:
 *
 *   - the intake is open (no auth) and we don't want to mint a
 *     company row until ops reviews it (anti-spam, anti-fraud);
 *   - we capture the raw payload as JSON so finance can audit the
 *     exact submission if anything is contested later.
 *
 * Approving an application materialises a `company` row + a Medusa
 * `customer` row + sets `customer.company_id` and
 * `customer.customer_tier_id`.
 *
 * `applicant_email` and `applicant_phone` are denormalised out of
 * the payload for fast lookup (admin "search applications by
 * email").
 */
export const CompanyApplication = model
  .define("company_application", {
    id: model.id({ prefix: "coapp" }).primaryKey(),

    gstin: model.text().nullable(),
    trade_name: model.text(),

    applicant_email: model.text(),
    applicant_phone: model.text().nullable(),

    /**
     * Full POST body, frozen at submission. Includes billing address and
     * contact name. The /apply route validates structure before persisting.
     */
    payload: model.json(),

    status: model
      .enum(["pending", "approved", "rejected"])
      .default("pending"),

    /** medusa user.id of the ops reviewer. */
    reviewer_id: model.text().nullable(),
    review_notes: model.text().nullable(),
    reviewed_at: model.dateTime().nullable(),

    /**
     * Once approved: the company.id we minted. Lets the admin UI
     * one-click into the company detail page from the application
     * row.
     */
    resulting_company_id: model.text().nullable(),

    /**
     * Sha-256 of submitter's IP. DPDP/GDPR hygiene — never store
     * raw IPs.
     */
    ip_hash: model.text().nullable(),
  })
  .indexes([
    { on: ["status"], unique: false, where: "deleted_at IS NULL" },
    {
      on: ["applicant_email"],
      unique: false,
      where: "deleted_at IS NULL",
    },
    {
      on: ["gstin"],
      unique: false,
      where: "deleted_at IS NULL",
    },
  ])
