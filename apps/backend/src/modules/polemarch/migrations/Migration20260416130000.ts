import { Migration } from "@mikro-orm/migrations"

/**
 * Initial `user_notifications` table. Serves the in-app notification
 * bell in the storefront. The polemarch module defines the model but
 * the table was never actually created — the storefront's /store/
 * notifications route was returning empty results silently.
 *
 * `link` is the deep-link path shown in the bell dropdown (e.g.
 * /invest/zepto) — null for informational notifications that don't
 * navigate anywhere.
 */
export class Migration20260416130000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "user_notifications" (
        "id" TEXT NOT NULL,
        "customer_id" TEXT NOT NULL,
        "title" TEXT NOT NULL DEFAULT '',
        "message" TEXT NOT NULL DEFAULT '',
        "type" TEXT NOT NULL DEFAULT '',
        "is_read" BOOLEAN NOT NULL DEFAULT false,
        "link" TEXT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
      );
    `)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_user_notifications_customer_id" ON "user_notifications" ("customer_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_user_notifications_deleted_at" ON "user_notifications" ("deleted_at") WHERE deleted_at IS NULL;`)
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "user_notifications" CASCADE;`)
  }
}
