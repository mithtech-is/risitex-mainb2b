import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Adds the BigNumber companion column `raw_value_minor` that the
 * `model.bigNumber()` field type expects alongside its numeric column.
 *
 * The initial migration was written before MikroORM started materialising
 * the `raw_<col>` JSONB sidecar for big-number fields, so any backend that
 * was installed against the old DDL hits:
 *
 *   column "raw_value_minor" of relation "purchase_order" does not exist
 *
 * on every PO INSERT/UPDATE. Backfills existing rows so listing endpoints
 * keep working too.
 */
export class Migration20260629000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "purchase_order" add column if not exists "raw_value_minor" jsonb;`,
    )
    this.addSql(
      `update "purchase_order" set "raw_value_minor" = jsonb_build_object('value', value_minor::text, 'precision', 20) where "raw_value_minor" is null;`,
    )
  }
  override async down(): Promise<void> {
    this.addSql(`alter table "purchase_order" drop column if exists "raw_value_minor";`)
  }
}
