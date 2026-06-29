import { model } from "@medusajs/framework/utils";

/**
 * B2B + textile-specific metadata layered onto Medusa's stock_location.
 *
 * Medusa already models stock locations, addresses, and inventory. This row
 * adds what Medusa doesn't natively model:
 *   - GST registration (India tax requirement)
 *   - Ownership flag (owned warehouse vs 3PL — affects margin)
 *   - Operating hours (for SLA + carrier pickup scheduling)
 *   - Daily dispatch capacity (used by order-routing workflow)
 *
 * Soft-FK to stock_location.id; unique.
 */
export const WarehouseProfile = model
  .define("warehouse_profile", {
    id: model.id({ prefix: "whprof" }).primaryKey(),

    stock_location_id: model.text(),

    gst_number: model.text().nullable(),
    is_owned: model.boolean().default(true),

    operating_hours: model.json().nullable(),
    daily_dispatch_capacity: model.number().nullable(),

    contact_name: model.text().nullable(),
    contact_phone: model.text().nullable(),
    contact_email: model.text().nullable(),

    active: model.boolean().default(true),

    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["stock_location_id"], unique: true, where: "deleted_at IS NULL" },
  ]);
