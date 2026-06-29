import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Adds the brand-config singleton. The seed loader installs a row with
 * `brand_name = 'Risitex'` on first boot; admin can update it from
 * the Communication settings UI.
 */
export class Migration20260429220000 extends Migration {
    override async up(): Promise<void> {
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_brand_config" (
                "id" text NOT NULL,
                "brand_name" text NOT NULL DEFAULT 'Risitex',
                "storefront_url" text NOT NULL DEFAULT 'https://risitex.com',
                "support_email" text NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_brand_config_pkey" PRIMARY KEY ("id")
            );
        `)
    }

    override async down(): Promise<void> {
        this.addSql(`DROP TABLE IF EXISTS "polemarch_brand_config";`)
    }
}
