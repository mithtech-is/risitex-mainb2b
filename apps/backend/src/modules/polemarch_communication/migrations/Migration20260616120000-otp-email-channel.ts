import { Migration } from "@mikro-orm/migrations"

/**
 * Phase A.1 — Extend the OTP-request table to support an email channel
 * alongside the original phone (WhatsApp / SMS) channel.
 *
 * Changes:
 *   1. ADD COLUMN channel — enum {phone, email}, NOT NULL DEFAULT 'phone'
 *      so existing rows are categorised as phone-OTPs.
 *   2. ADD COLUMN email — nullable text + index for per-email
 *      rate-limit / audit lookups.
 *   3. ALTER COLUMN phone_e164 DROP NOT NULL — email-channel rows
 *      legitimately have no phone.
 *   4. Expand the sent_via CHECK constraint to include 'email'.
 *
 * Idempotent via IF NOT EXISTS / DO $$ ... EXCEPTION blocks so re-running
 * `pnpm medusa db:migrate` on a partially-migrated DB is a no-op.
 */
export class Migration20260616120000 extends Migration {
    override async up(): Promise<void> {
        // 1. channel column + check
        this.addSql(`
            ALTER TABLE "polemarch_otp_request"
            ADD COLUMN IF NOT EXISTS "channel" text NOT NULL DEFAULT 'phone';
        `)
        this.addSql(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'polemarch_otp_request_channel_check'
                ) THEN
                    ALTER TABLE "polemarch_otp_request"
                    ADD CONSTRAINT "polemarch_otp_request_channel_check"
                    CHECK ("channel" IN ('phone', 'email'));
                END IF;
            END $$;
        `)
        this.addSql(`
            CREATE INDEX IF NOT EXISTS "IDX_polemarch_otp_request_channel"
            ON "polemarch_otp_request" ("channel");
        `)

        // 2. email column + index
        this.addSql(`
            ALTER TABLE "polemarch_otp_request"
            ADD COLUMN IF NOT EXISTS "email" text;
        `)
        this.addSql(`
            CREATE INDEX IF NOT EXISTS "IDX_polemarch_otp_request_email"
            ON "polemarch_otp_request" ("email");
        `)

        // 3. phone_e164 nullable
        this.addSql(`
            ALTER TABLE "polemarch_otp_request"
            ALTER COLUMN "phone_e164" DROP NOT NULL;
        `)

        // 4. Expand sent_via CHECK to include 'email'
        this.addSql(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'polemarch_otp_request_sent_via_check'
                ) THEN
                    ALTER TABLE "polemarch_otp_request"
                    DROP CONSTRAINT "polemarch_otp_request_sent_via_check";
                END IF;
            END $$;
        `)
        this.addSql(`
            ALTER TABLE "polemarch_otp_request"
            ADD CONSTRAINT "polemarch_otp_request_sent_via_check"
            CHECK ("sent_via" IS NULL OR "sent_via" IN ('whatsapp', 'sms', 'email', 'failed'));
        `)
    }

    override async down(): Promise<void> {
        // Down is a best-effort rollback — sent_via rows with 'email'
        // would violate the original CHECK, so we collapse them to
        // 'failed' before re-tightening the constraint.
        this.addSql(`
            UPDATE "polemarch_otp_request" SET "sent_via" = 'failed'
            WHERE "sent_via" = 'email';
        `)
        this.addSql(`
            ALTER TABLE "polemarch_otp_request"
            DROP CONSTRAINT IF EXISTS "polemarch_otp_request_sent_via_check";
        `)
        this.addSql(`
            ALTER TABLE "polemarch_otp_request"
            ADD CONSTRAINT "polemarch_otp_request_sent_via_check"
            CHECK ("sent_via" IS NULL OR "sent_via" IN ('whatsapp', 'sms', 'failed'));
        `)
        this.addSql(`
            DROP INDEX IF EXISTS "IDX_polemarch_otp_request_email";
        `)
        this.addSql(`
            DROP INDEX IF EXISTS "IDX_polemarch_otp_request_channel";
        `)
        this.addSql(`
            ALTER TABLE "polemarch_otp_request"
            DROP CONSTRAINT IF EXISTS "polemarch_otp_request_channel_check";
        `)
        this.addSql(`
            ALTER TABLE "polemarch_otp_request"
            DROP COLUMN IF EXISTS "email";
        `)
        this.addSql(`
            ALTER TABLE "polemarch_otp_request"
            DROP COLUMN IF EXISTS "channel";
        `)
        // phone_e164 stays nullable on rollback — making it NOT NULL
        // would fail if any email-channel rows had been written.
    }
}
