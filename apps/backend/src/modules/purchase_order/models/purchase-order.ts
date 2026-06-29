import { model } from "@medusajs/framework/utils"

/**
 * Captures the MBO's internal PO number + uploaded PO file at the
 * checkout PO step (FR-4.03 — Net-30 / Net-60 invoice path).
 *
 * `order_id` is the resulting Medusa order — null while the cart is
 * still pending; populated by /store/checkout/purchase-order on
 * complete.
 *
 * `file_url` resolves via the file_storage_provider (local / S3 /
 * R2). The storefront uploads the PDF to /store/upload first, then
 * passes the returned URL into the PO payload.
 */
export const PurchaseOrder = model
  .define("purchase_order", {
    id: model.id({ prefix: "po" }).primaryKey(),

    customer_id: model.text(),
    company_id: model.text().nullable(),
    order_id: model.text().nullable(),

    po_number: model.text(),
    file_url: model.text().nullable(),

    value_minor: model.bigNumber(),
    currency_code: model.text().default("inr"),

    expected_payment_date: model.dateTime().nullable(),

    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["customer_id"],
      unique: false,
      where: "deleted_at IS NULL",
    },
    {
      on: ["company_id"],
      unique: false,
      where: "company_id IS NOT NULL AND deleted_at IS NULL",
    },
    {
      on: ["order_id"],
      unique: false,
      where: "order_id IS NOT NULL AND deleted_at IS NULL",
    },
    {
      on: ["po_number"],
      unique: false,
      where: "deleted_at IS NULL",
    },
  ])
