import { model } from "@medusajs/framework/utils"

/**
 * Single-row runtime config for the two-rail checkout. The row's id is
 * always the constant `payment_settings` (see service.SETTINGS_ID) so
 * the admin/store routes upsert one canonical record. Secrets
 * (RAZORPAY_KEY_SECRET / WEBHOOK_SECRET) live ONLY in env — never here.
 *
 * `gateway_charge_percent` uses `model.float()`, not `model.number()`:
 * in this Medusa version `model.number()` maps to a Postgres `integer`
 * column, which would truncate a fractional gateway % (e.g. 2.5).
 * `model.float()` is the DSL's documented decimal-places type. The
 * migration still declares the column as `numeric` (arbitrary
 * precision) rather than float's default `real`, to avoid IEEE-754
 * rounding drift in fee arithmetic.
 */
export const PaymentSetting = model.define("payment_setting", {
  id: model.id().primaryKey(),
  manual_upi_enabled: model.boolean().default(true),
  razorpay_enabled: model.boolean().default(true),
  upi_id: model.text().default("risitex@upi"),
  upi_qr_image_url: model.text().nullable(),
  gateway_charge_percent: model.float().default(2),
  razorpay_mode: model.text().default("sandbox"),
  auto_capture: model.boolean().default(true),
})
