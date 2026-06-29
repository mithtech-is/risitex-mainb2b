import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260616200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "saved_cart" (
        "id" text not null,
        "customer_id" text not null,
        "company_id" text null,
        "name" text not null,
        "note" text null,
        "lines" jsonb not null,
        "item_count" integer not null default 0,
        "total_minor" numeric not null default 0,
        "currency_code" text not null default 'inr',
        "shared_with" jsonb null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "saved_cart_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index if not exists "IDX_saved_cart_customer_id"
        on "saved_cart" ("customer_id")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_saved_cart_company_id"
        on "saved_cart" ("company_id")
        where company_id is not null and deleted_at is null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "saved_cart" cascade;`)
  }
}
