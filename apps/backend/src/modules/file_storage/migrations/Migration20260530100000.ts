import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Creates `file_storage_setting` — the singleton holding the active
 * public file-storage backend config (local or S3-compatible), editable
 * from the admin UI. The secret access key column holds AES-256-GCM
 * ciphertext, not plaintext.
 */
export class Migration20260530100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "file_storage_setting" (
        "id" text NOT NULL,
        "singleton_key" text NOT NULL DEFAULT 'default',
        "provider" text NOT NULL DEFAULT 'local',
        "s3_bucket" text NULL,
        "s3_endpoint" text NULL,
        "s3_region" text NOT NULL DEFAULT 'auto',
        "s3_file_url" text NULL,
        "s3_prefix" text NULL,
        "s3_force_path_style" boolean NOT NULL DEFAULT false,
        "s3_cache_control" text NOT NULL DEFAULT 'public, max-age=31536000, immutable',
        "s3_access_key_id" text NULL,
        "s3_secret_access_key_encrypted" text NULL,
        "updated_by_user_id" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "file_storage_setting_pkey" PRIMARY KEY ("id")
      );
    `)
    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_file_storage_setting_singleton"
      ON "file_storage_setting" ("singleton_key")
      WHERE "deleted_at" IS NULL;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "file_storage_setting";`)
  }
}
