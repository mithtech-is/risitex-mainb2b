import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Drops the `dashboard_token_encrypted` column from PolyginConfig.
 *
 * The dashboard JWT was a workaround for Polygin's `/api/user/*`
 * template-management endpoints, which the public REST API token can't
 * authenticate against. Templates are now managed on polyg.in's web UI
 * directly, so this admin no longer needs the dashboard JWT.
 */
export class Migration20260502120000 extends Migration {
    override async up(): Promise<void> {
        this.addSql(`
            ALTER TABLE "polemarch_polygin_config"
            DROP COLUMN IF EXISTS "dashboard_token_encrypted";
        `)
    }

    override async down(): Promise<void> {
        this.addSql(`
            ALTER TABLE "polemarch_polygin_config"
            ADD COLUMN IF NOT EXISTS "dashboard_token_encrypted" text NULL;
        `)
    }
}
