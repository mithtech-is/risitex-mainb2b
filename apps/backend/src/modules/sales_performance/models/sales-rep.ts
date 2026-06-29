import { model } from "@medusajs/framework/utils"

/**
 * RISITEX sales representative — internal staff who:
 *
 *   - get attributed to one or more MBO accounts (FR-8.01,
 *     SalesRepAssignment),
 *   - earn commission on every order placed by those MBOs (FR-8.02
 *     perpetual attribution — applies whether the order was placed
 *     by the rep via FR-1.04 impersonation or self-serve by the MBO),
 *   - have variable commission rates by transaction type
 *     (FR-8.03 first-order vs restock) via commission_rule rows
 *     keyed on (sales_rep_id, scope),
 *   - get their attribution + commission payload synced into
 *     ERPNext on order.placed (FR-8.05, Phase 8 subscriber).
 *
 * `employee_id` is the rep's HR ID — used as the canonical join key
 * with ERPNext Employee / Payroll.
 *
 * Rep impersonation (FR-1.04) flows: admin clicks "act as MBO X"
 * → /admin/sales-reps/:id/impersonate → server issues a customer-
 * scoped session token for the MBO. The customer that's actually
 * driving the cart at that moment is the MBO; the rep id rides
 * along on order.metadata.placed_by_rep_id for audit + commission
 * calculation (the assignment table is also consulted by the
 * order-placed-commission subscriber regardless).
 */
export const SalesRep = model
  .define("sales_rep", {
    id: model.id({ prefix: "srep" }).primaryKey(),

    employee_id: model.text(),
    name: model.text(),
    email: model.text(),
    phone: model.text().nullable(),

    active: model.boolean().default(true),

    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["employee_id"], unique: true, where: "deleted_at IS NULL" },
    { on: ["email"], unique: true, where: "deleted_at IS NULL" },
    { on: ["active"], unique: false, where: "deleted_at IS NULL" },
  ])
