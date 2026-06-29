import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Adds the bot-button knobs to BrandConfig:
 *
 *   - whatsapp_bot_label       text — the button text + the
 *                                     `{{whatsapp_bot}}` placeholder.
 *   - whatsapp_bot_categories  jsonb — which categories the refresh
 *                                     job adds the bot button to.
 *                                     AUTHENTICATION is omitted by
 *                                     default because Meta blocks
 *                                     custom QUICK_REPLY buttons there.
 */
export class Migration20260502140000 extends Migration {
    override async up(): Promise<void> {
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            ADD COLUMN IF NOT EXISTS "whatsapp_bot_label" text NOT NULL
            DEFAULT 'Initiate Bot';
        `)
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            ADD COLUMN IF NOT EXISTS "whatsapp_bot_categories" jsonb NOT NULL
            DEFAULT '["UTILITY","MARKETING"]'::jsonb;
        `)
    }

    override async down(): Promise<void> {
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            DROP COLUMN IF EXISTS "whatsapp_bot_categories";
        `)
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            DROP COLUMN IF EXISTS "whatsapp_bot_label";
        `)
    }
}
