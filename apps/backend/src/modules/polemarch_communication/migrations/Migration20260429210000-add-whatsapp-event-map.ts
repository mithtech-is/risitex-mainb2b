import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Adds the WhatsApp event-mapping table — companion to the existing
 * `polemarch_event_template_map` (which is email-only).
 *
 * Idempotent. No data backfill — the seed loader installs default
 * mappings for the events Risitex already cares about.
 */
export class Migration20260429210000 extends Migration {
    override async up(): Promise<void> {
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_whatsapp_event_map" (
                "id" text NOT NULL,
                "event_name" text NOT NULL,
                "template_slug" text NOT NULL,
                "to_resolver" text NOT NULL DEFAULT 'customer_phone'
                    CHECK ("to_resolver" IN ('customer_phone','static')),
                "static_to" text NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_whatsapp_event_map_pkey" PRIMARY KEY ("id")
            );
        `)
        this.addSql(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_polemarch_wa_event_name" ON "polemarch_whatsapp_event_map" ("event_name") WHERE "deleted_at" IS NULL;`,
        )
    }

    override async down(): Promise<void> {
        this.addSql(`DROP TABLE IF EXISTS "polemarch_whatsapp_event_map";`)
    }
}
