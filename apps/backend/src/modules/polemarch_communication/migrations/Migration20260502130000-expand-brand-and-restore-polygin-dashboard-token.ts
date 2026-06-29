import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Two related changes:
 *
 * 1. Expand `polemarch_brand_config` with the wider brand surface used
 *    by the new Communication → Brand tab:
 *      - company_name   (legal entity for footers / compliance)
 *      - support_phone  (E.164 contact number)
 *      - address        (registered office / footer line)
 *      - tagline        (short marketing line)
 *
 * 2. Restore the optional `dashboard_token_encrypted` column on
 *    `polemarch_polygin_config`. Polygin's `/api/user/*` template
 *    endpoints accept the dashboard JWT (captured from
 *    localStorage.wacrm_user) for status sync + template push, while
 *    the public REST API token only handles message sends. We removed
 *    this column earlier; reintroduce it as OPTIONAL (template
 *    management features are gated on whether it's set, manual flow
 *    still works without it).
 */
export class Migration20260502130000 extends Migration {
    override async up(): Promise<void> {
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            ADD COLUMN IF NOT EXISTS "company_name" text NULL;
        `)
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            ADD COLUMN IF NOT EXISTS "support_phone" text NULL;
        `)
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            ADD COLUMN IF NOT EXISTS "address" text NULL;
        `)
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            ADD COLUMN IF NOT EXISTS "tagline" text NULL;
        `)
        this.addSql(`
            ALTER TABLE "polemarch_polygin_config"
            ADD COLUMN IF NOT EXISTS "dashboard_token_encrypted" text NULL;
        `)
    }

    override async down(): Promise<void> {
        this.addSql(`
            ALTER TABLE "polemarch_polygin_config"
            DROP COLUMN IF EXISTS "dashboard_token_encrypted";
        `)
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            DROP COLUMN IF EXISTS "tagline";
        `)
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            DROP COLUMN IF EXISTS "address";
        `)
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            DROP COLUMN IF EXISTS "support_phone";
        `)
        this.addSql(`
            ALTER TABLE "polemarch_brand_config"
            DROP COLUMN IF EXISTS "company_name";
        `)
    }
}
