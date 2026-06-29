import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Adds a `dashboard_token_encrypted` column to PolyginConfig.
 *
 * Polygin requires two different JWTs in practice:
 *   - REST API token  (the existing `token_encrypted` column)
 *     used for /api/v1/send-message, /api/v1/send_templet,
 *     /api/qr/rest/send_message
 *   - DASHBOARD JWT   (this new column)
 *     used for /api/user/add_meta_templet,
 *     /api/user/get_my_meta_templets_beta
 *
 * They live as separate columns so the admin can rotate either
 * independently. The dashboard JWT is captured by the admin from
 * their browser's localStorage (`wacrm_user`) on polyg.in — Polygin
 * doesn't expose it via a UI.
 */
export class Migration20260429230000 extends Migration {
    override async up(): Promise<void> {
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
    }
}
