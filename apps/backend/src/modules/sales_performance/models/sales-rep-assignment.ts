import { model } from "@medusajs/framework/utils"

/**
 * Binds a sales rep to either an individual buyer account or a company
 * (B2B, covering every customer under that company) for FR-8.01
 * rep-to-account mapping.
 *
 * Resolution order at order-placement time
 * (order-placed-commission subscriber):
 *
 *   1. order.metadata.placed_by_rep_id  — explicit rep on the cart
 *      (FR-1.04 impersonation flow; rep clicked "act as MBO" and
 *      drove the order themselves). Wins outright.
 *   2. SalesRepAssignment WHERE customer_id = order.customer_id    — per-
 *      customer override (rare; some MBOs assign individual contacts
 *      to specific reps).
 *   3. SalesRepAssignment WHERE company_id = customer.company_id   — the
 *      default B2B path.
 *   4. None → no commission written.
 *
 * `valid_until` lets us re-assign without losing the audit trail —
 * close out the old row (`valid_until = now()`) and create a new one;
 * the resolver only considers rows where `valid_until IS NULL OR
 * valid_until > now()`.
 *
 * Exactly one of `customer_id` / `company_id` is set per row (CHECK
 * constraint at the DB level — the migration enforces it).
 */
export const SalesRepAssignment = model
  .define("sales_rep_assignment", {
    id: model.id({ prefix: "srepa" }).primaryKey(),

    sales_rep_id: model.text(),

    customer_id: model.text().nullable(),
    company_id: model.text().nullable(),

    assigned_at: model.dateTime(),
    valid_until: model.dateTime().nullable(),

    notes: model.text().nullable(),

    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["sales_rep_id"], unique: false, where: "deleted_at IS NULL" },
    {
      on: ["customer_id"],
      unique: false,
      where: "customer_id IS NOT NULL AND deleted_at IS NULL",
    },
    {
      on: ["company_id"],
      unique: false,
      where: "company_id IS NOT NULL AND deleted_at IS NULL",
    },
  ])
