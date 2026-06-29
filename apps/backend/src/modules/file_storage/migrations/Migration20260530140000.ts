import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Adds `provider_preset` to `file_storage_setting`.
 *
 * UI-only hint recording which S3 provider preset the admin selected
 * (r2 | aws | minio | wasabi | do | other) so the settings page can
 * re-render the right tailored form on reload. The runtime provider
 * itself only reads endpoint/region/keys, so this column is advisory.
 */
export class Migration20260530140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `ALTER TABLE "file_storage_setting" ADD COLUMN IF NOT EXISTS "provider_preset" text NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `ALTER TABLE "file_storage_setting" DROP COLUMN IF EXISTS "provider_preset";`,
    )
  }
}
