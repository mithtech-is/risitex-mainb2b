import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260618114630 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "discount_code" drop constraint if exists "discount_code_code_unique";`);
    this.addSql(`create table if not exists "discount_code" ("id" text not null, "code" text not null, "promotion_id" text not null, "discount_type" text check ("discount_type" in ('percentage', 'fixed')) not null default 'percentage', "value" integer not null, "min_order_units" integer not null default 0, "max_usage" integer null, "expires_at" timestamptz null, "combinable_with_tier" boolean not null default false, "campaign_id" text null, "active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "discount_code_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_discount_code_deleted_at" ON "discount_code" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_discount_code_code_unique" ON "discount_code" ("code") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "discount_code" cascade;`);
  }

}
