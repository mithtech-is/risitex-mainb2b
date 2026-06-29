import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Adds the WhatsApp + SMS message-template registries.
 *
 * Idempotent (CREATE TABLE IF NOT EXISTS). No data backfill is needed —
 * the seed loader installs the system catalog on boot.
 */
export class Migration20260429180000 extends Migration {
    override async up(): Promise<void> {
        // ─── WhatsApp template registry ─────────────────────────────
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_whatsapp_template" (
                "id" text NOT NULL,
                "slug" text NOT NULL,
                "name" text NOT NULL,
                "label" text NULL,
                "description" text NULL,
                "category" text NOT NULL,
                "language" text NOT NULL DEFAULT 'en',
                "template_type" text NOT NULL DEFAULT 'STANDARD',
                "components" jsonb NOT NULL,
                "variables" jsonb NULL,
                "is_system" boolean NOT NULL DEFAULT false,
                "polygin_status" text NOT NULL DEFAULT 'draft' CHECK ("polygin_status" IN ('draft','pushed','approved','rejected','paused')),
                "polygin_template_id" text NULL,
                "polygin_pushed_at" timestamptz NULL,
                "polygin_last_synced_at" timestamptz NULL,
                "polygin_last_error" text NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_whatsapp_template_pkey" PRIMARY KEY ("id")
            );
        `)
        this.addSql(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_polemarch_wa_tpl_slug" ON "polemarch_whatsapp_template" ("slug") WHERE "deleted_at" IS NULL;`,
        )

        // ─── SMS template registry ──────────────────────────────────
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_sms_template" (
                "id" text NOT NULL,
                "slug" text NOT NULL,
                "label" text NULL,
                "description" text NULL,
                "body" text NOT NULL,
                "variables" jsonb NULL,
                "dlt_template_id" text NULL,
                "dlt_status" text NOT NULL DEFAULT 'draft' CHECK ("dlt_status" IN ('draft','pending','approved','rejected')),
                "dlt_last_error" text NULL,
                "is_otp" boolean NOT NULL DEFAULT false,
                "is_system" boolean NOT NULL DEFAULT false,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_sms_template_pkey" PRIMARY KEY ("id")
            );
        `)
        this.addSql(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_polemarch_sms_tpl_slug" ON "polemarch_sms_template" ("slug") WHERE "deleted_at" IS NULL;`,
        )
    }

    override async down(): Promise<void> {
        this.addSql(`DROP TABLE IF EXISTS "polemarch_whatsapp_template";`)
        this.addSql(`DROP TABLE IF EXISTS "polemarch_sms_template";`)
    }
}
