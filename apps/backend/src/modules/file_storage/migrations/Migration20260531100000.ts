import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Split `file_storage_setting` into two scopes keyed by `singleton_key`:
 *   - "public"  → product images / logos (the File Module provider)
 *   - "private" → KYC / proof uploads (the polemarch private-storage path)
 *
 * The pre-existing singleton (`singleton_key = 'default'`) becomes the
 * PUBLIC config. A fresh PRIVATE row is seeded defaulting to local disk,
 * so the live KYC flow is unchanged until an operator switches it.
 */
export class Migration20260531100000 extends Migration {
  override async up(): Promise<void> {
    // Existing singleton → public scope.
    this.addSql(
      `UPDATE "file_storage_setting" SET "singleton_key" = 'public' WHERE "singleton_key" = 'default';`,
    )
    // Seed the private scope (local) if it doesn't exist yet.
    this.addSql(`
      INSERT INTO "file_storage_setting" ("id", "singleton_key", "provider", "created_at", "updated_at")
      SELECT 'fsset_private_seed', 'private', 'local', now(), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM "file_storage_setting" WHERE "singleton_key" = 'private' AND "deleted_at" IS NULL
      );
    `)
  }

  override async down(): Promise<void> {
    this.addSql(
      `DELETE FROM "file_storage_setting" WHERE "singleton_key" = 'private';`,
    )
    this.addSql(
      `UPDATE "file_storage_setting" SET "singleton_key" = 'default' WHERE "singleton_key" = 'public';`,
    )
  }
}
