import { model } from "@medusajs/framework/utils"

/**
 * RISITEX Company — the B2B account that holds one or more Medusa
 * customers (the people who actually log in) and the commercial
 * settings (tier, credit terms, GST identity).
 *
 * One company per GSTIN (UNIQUE). The customer.company_id soft-FK
 * (lives on the customer table, added by
 * migrations/2026-06-15_customer-b2b-fields.sql) is the join: every
 * approved B2B login resolves to exactly one company.
 *
 * `status` state machine:
 *
 *   pending   → approved   (admin clicks "Approve" in /app/companies)
 *   pending   → rejected   (admin clicks "Reject")
 *   approved  → suspended  (ops freezes the account)
 *   suspended → approved   (ops unfreezes)
 *
 * Once approved, the company gets a Medusa customer attached and the
 * customer.metadata.b2b_status mirrors `status` for fast gating at
 * the API edge. Frontend gates on the customer field (cheap), backend
 * authoritative-truths on this row (slow, correct).
 *
 * `customer_tier_id` is a soft-FK to customer_tier.id — drives the
 * tier-aware price quote in Phase 4.5 (tier_pricing module).
 */
export const Company = model
  .define("company", {
    id: model.id({ prefix: "co" }).primaryKey(),

    /**
     * 15-character India GSTIN. Validated at API edge with the
     * canonical regex when provided. UNIQUE across non-deleted rows
     * so a company can't double-register. Nullable so users can
     * register without a GSTIN and add it later.
     */
    gstin: model.text().nullable(),

    /**
     * Applicant email — the email of the customer who registered
     * this company. Used by the admin search to find companies when
     * no GSTIN is on file.
     */
    applicant_email: model.text(),

    /** Legal trade name as recorded with GST. */
    trade_name: model.text(),

    /**
     * Billing address. Stored as a JSON blob (not Medusa Address
     * rows) because (a) one company can have many shipping addresses
     * but only one billing address and (b) we don't want to wire
     * into Medusa's customer_address model when company-scoped.
     *
     * Shape:
     *   { line1, line2?, city, state, postal_code, country_code }
     */
    billing_address: model.json(),

    status: model
      .enum(["pending", "approved", "rejected", "suspended"])
      .default("pending"),

    /** Soft-FK → customer_tier.id. Null until admin assigns. */
    customer_tier_id: model.text().nullable(),

    /**
     * Soft-FK → credit_terms.id (Phase 10 module). Null until
     * admin assigns. Falls back to the tier's default_payment_terms
     * resolved at order-placement time.
     */
    credit_terms_id: model.text().nullable(),

    /**
     * Soft-FK → sales_rep.id (Phase 7 module). Drives FR-8.02
     * perpetual attribution — every order placed by any customer
     * attached to this company gets attributed to this rep.
     */
    sales_rep_id: model.text().nullable(),

    /** Free-form notes from ops review / approval / suspension. */
    review_notes: model.text().nullable(),

    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["gstin"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { on: ["status"], unique: false, where: "deleted_at IS NULL" },
    {
      on: ["customer_tier_id"],
      unique: false,
      where: "customer_tier_id IS NOT NULL AND deleted_at IS NULL",
    },
    {
      on: ["sales_rep_id"],
      unique: false,
      where: "sales_rep_id IS NOT NULL AND deleted_at IS NULL",
    },
  ])
