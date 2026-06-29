import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Adds the five new tables that broaden polemarch_email →
 * polemarch_communication: MSG91 + Polygin configs, SMS + WhatsApp send
 * logs, and the per-OTP request tracker.
 *
 * No changes to existing email tables. This migration is idempotent
 * (CREATE TABLE IF NOT EXISTS) so re-running it on a partially-applied
 * stack is safe.
 */
export class Migration20260429120000 extends Migration {
    override async up(): Promise<void> {
        // ─── MSG91 SMS gateway config (singleton) ──────────────────
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_msg91_config" (
                "id" text NOT NULL,
                "auth_key_encrypted" text NULL,
                "sender_id" text NULL,
                "sms_template_id" text NULL,
                "otp_template_id" text NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "last_test_at" timestamptz NULL,
                "last_test_ok" boolean NULL,
                "last_test_error" text NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_msg91_config_pkey" PRIMARY KEY ("id")
            );
        `)

        // ─── Polygin WhatsApp gateway config (singleton) ───────────
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_polygin_config" (
                "id" text NOT NULL,
                "token_encrypted" text NULL,
                "sender_phone" text NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "last_test_at" timestamptz NULL,
                "last_test_ok" boolean NULL,
                "last_test_error" text NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_polygin_config_pkey" PRIMARY KEY ("id")
            );
        `)

        // ─── SMS send log ──────────────────────────────────────────
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_sms_log" (
                "id" text NOT NULL,
                "to_phone" text NOT NULL,
                "body" text NULL,
                "provider" text NOT NULL DEFAULT 'msg91',
                "status" text NOT NULL CHECK ("status" IN ('sent','failed','skipped')),
                "error" text NULL,
                "provider_message_id" text NULL,
                "otp_request_id" text NULL,
                "meta" jsonb NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_sms_log_pkey" PRIMARY KEY ("id")
            );
        `)
        this.addSql(
            `CREATE INDEX IF NOT EXISTS "IDX_polemarch_sms_log_to_phone" ON "polemarch_sms_log" ("to_phone") WHERE "deleted_at" IS NULL;`,
        )
        this.addSql(
            `CREATE INDEX IF NOT EXISTS "IDX_polemarch_sms_log_otp" ON "polemarch_sms_log" ("otp_request_id") WHERE "deleted_at" IS NULL;`,
        )

        // ─── WhatsApp send log ─────────────────────────────────────
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_whatsapp_log" (
                "id" text NOT NULL,
                "to_phone" text NOT NULL,
                "body" text NULL,
                "provider" text NOT NULL DEFAULT 'polygin',
                "status" text NOT NULL CHECK ("status" IN ('sent','failed','skipped')),
                "error" text NULL,
                "provider_message_id" text NULL,
                "otp_request_id" text NULL,
                "meta" jsonb NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_whatsapp_log_pkey" PRIMARY KEY ("id")
            );
        `)
        this.addSql(
            `CREATE INDEX IF NOT EXISTS "IDX_polemarch_whatsapp_log_to_phone" ON "polemarch_whatsapp_log" ("to_phone") WHERE "deleted_at" IS NULL;`,
        )
        this.addSql(
            `CREATE INDEX IF NOT EXISTS "IDX_polemarch_whatsapp_log_otp" ON "polemarch_whatsapp_log" ("otp_request_id") WHERE "deleted_at" IS NULL;`,
        )

        // ─── Phone-OTP request tracker ─────────────────────────────
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_otp_request" (
                "id" text NOT NULL,
                "phone_e164" text NOT NULL,
                "purpose" text NOT NULL CHECK ("purpose" IN ('login','verify')),
                "customer_id" text NULL,
                "otp_hash" text NOT NULL,
                "salt" text NOT NULL,
                "attempts" integer NOT NULL DEFAULT 0,
                "max_attempts" integer NOT NULL DEFAULT 5,
                "expires_at" timestamptz NOT NULL,
                "consumed_at" timestamptz NULL,
                "sent_via" text NULL CHECK ("sent_via" IN ('whatsapp','sms','failed')),
                "provider_message_id" text NULL,
                "ip_hash" text NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_otp_request_pkey" PRIMARY KEY ("id")
            );
        `)
        this.addSql(
            `CREATE INDEX IF NOT EXISTS "IDX_polemarch_otp_phone" ON "polemarch_otp_request" ("phone_e164") WHERE "deleted_at" IS NULL;`,
        )
        this.addSql(
            `CREATE INDEX IF NOT EXISTS "IDX_polemarch_otp_purpose" ON "polemarch_otp_request" ("purpose") WHERE "deleted_at" IS NULL;`,
        )
        this.addSql(
            `CREATE INDEX IF NOT EXISTS "IDX_polemarch_otp_customer" ON "polemarch_otp_request" ("customer_id") WHERE "deleted_at" IS NULL;`,
        )
        this.addSql(
            `CREATE INDEX IF NOT EXISTS "IDX_polemarch_otp_ip" ON "polemarch_otp_request" ("ip_hash") WHERE "deleted_at" IS NULL;`,
        )
    }

    override async down(): Promise<void> {
        // Reverse-order drops — logs first because they reference
        // otp_request rows by id (informally, no FK constraint).
        this.addSql(`DROP TABLE IF EXISTS "polemarch_sms_log";`)
        this.addSql(`DROP TABLE IF EXISTS "polemarch_whatsapp_log";`)
        this.addSql(`DROP TABLE IF EXISTS "polemarch_otp_request";`)
        this.addSql(`DROP TABLE IF EXISTS "polemarch_msg91_config";`)
        this.addSql(`DROP TABLE IF EXISTS "polemarch_polygin_config";`)
    }
}
