import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Adds `test_phone` to PolyginConfig — saved destination for the
 * "send test" / "send template test" admin probe actions so the
 * operator doesn't retype the number on every test. E.164 form,
 * nullable, no default.
 */
export class Migration20260502180000 extends Migration {
    override async up(): Promise<void> {
        this.addSql(`
            ALTER TABLE "polemarch_polygin_config"
            ADD COLUMN IF NOT EXISTS "test_phone" text;
        `)
    }

    override async down(): Promise<void> {
        this.addSql(`
            ALTER TABLE "polemarch_polygin_config"
            DROP COLUMN IF EXISTS "test_phone";
        `)
    }
}
