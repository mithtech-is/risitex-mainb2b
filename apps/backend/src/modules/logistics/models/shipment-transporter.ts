import { model } from "@medusajs/framework/utils"

/**
 * Carrier + vehicle metadata attached to a shipment when the
 * warehouse dispatches it (FR-10.02).
 *
 * `transporter_code` is a free-form short string like "porter",
 * "vrl", "srmt", "national" — the storefront UI maps these to brand
 * logos. We don't enum-constrain it here so ops can add a new
 * transporter without a code deploy.
 *
 * `awb` (AWB / docket / tracking number) is what the carrier returns;
 * Porter calls it `tracking_id`, VRL calls it `LR Number`. The
 * /store/shipments/:id/track endpoint surfaces this raw value so
 * the storefront can deep-link into the carrier portal.
 *
 * `shipment_id` is a soft-FK to Medusa's `fulfillment.id` (one
 * transporter row per fulfillment).
 *
 * On dispatch, the warehouse PATCHes the fulfillment in Medusa to
 * mark it shipped, and a subscriber (Phase 9.5) writes a
 * Delivery Note doctype into ERPNext (FR-10.01) carrying this row.
 */
export const ShipmentTransporter = model
  .define("shipment_transporter", {
    id: model.id({ prefix: "shtxp" }).primaryKey(),

    shipment_id: model.text(),

    transporter_code: model.text(),
    transporter_display_name: model.text().nullable(),

    vehicle_number: model.text().nullable(),
    awb: model.text().nullable(),

    dispatched_at: model.dateTime(),

    notes: model.text().nullable(),

    // FR-5.02 live carrier tracking — cached by the poll-courier-tracking job.
    live_status: model.text().nullable(), // canonical CourierStatus
    live_status_raw: model.text().nullable(), // carrier's own status string
    live_status_event: model.text().nullable(), // latest event description
    live_status_at: model.dateTime().nullable(), // when last polled

    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["shipment_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["transporter_code"],
      unique: false,
      where: "deleted_at IS NULL",
    },
    {
      on: ["awb"],
      unique: false,
      where: "awb IS NOT NULL AND deleted_at IS NULL",
    },
  ])
