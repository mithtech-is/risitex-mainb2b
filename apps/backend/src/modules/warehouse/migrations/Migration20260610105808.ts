import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260610105808 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "warehouse_profile" drop constraint if exists "warehouse_profile_stock_location_id_unique";`);
    this.addSql(`create table if not exists "warehouse_profile" ("id" text not null, "stock_location_id" text not null, "gst_number" text null, "is_owned" boolean not null default true, "operating_hours" jsonb null, "daily_dispatch_capacity" integer null, "contact_name" text null, "contact_phone" text null, "contact_email" text null, "active" boolean not null default true, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "warehouse_profile_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_warehouse_profile_deleted_at" ON "warehouse_profile" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_warehouse_profile_stock_location_id_unique" ON "warehouse_profile" ("stock_location_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "warehouse_profile" cascade;`);
  }

}
