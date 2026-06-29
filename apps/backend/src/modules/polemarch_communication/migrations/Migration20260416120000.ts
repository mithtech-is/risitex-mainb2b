import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260416120000 extends Migration {
    override async up(): Promise<void> {
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_smtp_config" (
                "id" text NOT NULL,
                "host" text NOT NULL,
                "port" integer NOT NULL DEFAULT 587,
                "secure" boolean NOT NULL DEFAULT false,
                "username" text NULL,
                "password_encrypted" text NULL,
                "from_name" text NULL,
                "from_email" text NOT NULL,
                "reply_to" text NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "last_test_at" timestamptz NULL,
                "last_test_ok" boolean NULL,
                "last_test_error" text NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_smtp_config_pkey" PRIMARY KEY ("id")
            );
        `)

        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_email_template" (
                "id" text NOT NULL,
                "slug" text NOT NULL,
                "name" text NOT NULL,
                "subject" text NOT NULL,
                "html" text NOT NULL,
                "is_system" boolean NOT NULL DEFAULT false,
                "sample_data" jsonb NULL,
                "description" text NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_email_template_pkey" PRIMARY KEY ("id")
            );
        `)
        this.addSql(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_polemarch_email_template_slug_unique" ON "polemarch_email_template" ("slug") WHERE deleted_at IS NULL;`
        )

        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_email_log" (
                "id" text NOT NULL,
                "to_email" text NOT NULL,
                "template_slug" text NULL,
                "subject" text NULL,
                "status" text NOT NULL,
                "error" text NULL,
                "provider_message_id" text NULL,
                "meta" jsonb NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_email_log_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "polemarch_email_log_status_check" CHECK ("status" IN ('sent', 'failed', 'skipped'))
            );
        `)
        this.addSql(
            `CREATE INDEX IF NOT EXISTS "IDX_polemarch_email_log_to_email" ON "polemarch_email_log" ("to_email") WHERE deleted_at IS NULL;`
        )
        this.addSql(
            `CREATE INDEX IF NOT EXISTS "IDX_polemarch_email_log_template_slug" ON "polemarch_email_log" ("template_slug") WHERE deleted_at IS NULL;`
        )

        this.addSql(`
            CREATE TABLE IF NOT EXISTS "polemarch_event_template_map" (
                "id" text NOT NULL,
                "event_name" text NOT NULL,
                "template_slug" text NOT NULL,
                "to_resolver" text NOT NULL DEFAULT 'customer_email',
                "static_to" text NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "deleted_at" timestamptz NULL,
                CONSTRAINT "polemarch_event_template_map_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "polemarch_event_template_map_to_resolver_check" CHECK ("to_resolver" IN ('customer_email', 'admin_email', 'static'))
            );
        `)
        this.addSql(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_polemarch_event_template_map_event_name_unique" ON "polemarch_event_template_map" ("event_name") WHERE deleted_at IS NULL;`
        )
    }

    override async down(): Promise<void> {
        this.addSql(`DROP TABLE IF EXISTS "polemarch_event_template_map" CASCADE;`)
        this.addSql(`DROP TABLE IF EXISTS "polemarch_email_log" CASCADE;`)
        this.addSql(`DROP TABLE IF EXISTS "polemarch_email_template" CASCADE;`)
        this.addSql(`DROP TABLE IF EXISTS "polemarch_smtp_config" CASCADE;`)
    }
}
