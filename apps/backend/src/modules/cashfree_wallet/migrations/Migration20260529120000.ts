import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Adds `gstin_collection_enabled` to `cashfree_setting`.
 *
 * Controls whether the optional GSTIN input is shown at checkout. GST is
 * still charged on platform fees, low-order fees, and stamp duty
 * regardless of this flag — it only governs the input's visibility.
 *
 * Defaults to FALSE so the field is hidden until an operator turns it on
 * (it will be gated to business/company customers later).
 */
export class Migration20260529120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `ALTER TABLE "cashfree_setting" ADD COLUMN IF NOT EXISTS "gstin_collection_enabled" boolean NOT NULL DEFAULT false;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `ALTER TABLE "cashfree_setting" DROP COLUMN IF EXISTS "gstin_collection_enabled";`,
    )
  }
}
