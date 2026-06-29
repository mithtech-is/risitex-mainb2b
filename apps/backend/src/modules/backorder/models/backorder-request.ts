import { model } from "@medusajs/framework/utils"

/**
 * Backorder placement (FR-9.03). One row per SKU+qty an MBO is
 * willing to wait for. The complete-cart workflow scans line items
 * that exceed available stock, splits the over-quantity into a
 * BackorderRequest, and proceeds with whatever the warehouse can
 * actually ship today.
 *
 * `jira_ticket_id` links to the production / packaging ticket the
 * backorder subscriber opens (FR-5.03). Soft-FK — the Jira webhook
 * happens after this row is written, so the ticket id is patched in
 * a moment later.
 *
 * Status state machine:
 *
 *   pending     — written at cart completion, no production action
 *                 yet.
 *   in_prod     — Jira ticket transitioned to "In progress"
 *                 (backorder-jira-webhook subscriber on Phase 9.5).
 *   fulfilled   — warehouse dispatched; converted to a regular
 *                 fulfillment row.
 *   cancelled   — MBO withdrew the backorder, or it expired past
 *                 max_lead_days without production confirmation.
 */
export const BackorderRequest = model
  .define("backorder_request", {
    id: model.id({ prefix: "bo" }).primaryKey(),

    order_id: model.text(),
    line_id: model.text(),
    sku: model.text(),
    qty: model.number(),

    /** Estimated dispatch date — populated when production confirms. */
    eta: model.dateTime().nullable(),

    /** Jira issue key (e.g. "RSTX-1234"). */
    jira_ticket_id: model.text().nullable(),

    status: model
      .enum(["pending", "in_prod", "fulfilled", "cancelled"])
      .default("pending"),

    cancelled_reason: model.text().nullable(),
    cancelled_at: model.dateTime().nullable(),

    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["order_id"], unique: false, where: "deleted_at IS NULL" },
    { on: ["sku"], unique: false, where: "deleted_at IS NULL" },
    { on: ["status"], unique: false, where: "deleted_at IS NULL" },
    {
      on: ["jira_ticket_id"],
      unique: false,
      where: "jira_ticket_id IS NOT NULL AND deleted_at IS NULL",
    },
  ])
