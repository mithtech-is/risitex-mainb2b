import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260615150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "master_carton" (
        "id" text not null,
        "name" text not null,
        "sku_template" text not null,
        "total_units" integer not null,
        "size_ratio" jsonb not null,
        "active" boolean not null default true,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "master_carton_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index if not exists "IDX_master_carton_active"
        on "master_carton" ("active") where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_master_carton_sku_template"
        on "master_carton" ("sku_template") where deleted_at is null;
    `)
  }
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "master_carton" cascade;`)
  }
}
