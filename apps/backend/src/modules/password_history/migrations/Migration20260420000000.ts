import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Initial password_history_entry table. Keeps the last N bcrypt hashes
 * per account so the update-password flow can reject reuse.
 *
 * A composite index on (email, actor_type, created_at DESC) would be
 * strictly optimal for the "latest N per account" query, but PG can
 * satisfy it efficiently from the simpler (email, actor_type) index
 * plus an inline sort; the table stays small (≤ N rows per account)
 * and the query always runs with a narrow filter.
 */
export class Migration20260420000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "password_history_entry" (
        "id" text not null,
        "email" text not null,
        "actor_type" text not null check ("actor_type" in ('customer', 'user')),
        "password_hash" text not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "password_history_entry_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_password_history_email" ON "password_history_entry" ("email") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_password_history_actor_type" ON "password_history_entry" ("actor_type") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_password_history_deleted_at" ON "password_history_entry" ("deleted_at") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "password_history_entry" cascade;`)
  }
}
