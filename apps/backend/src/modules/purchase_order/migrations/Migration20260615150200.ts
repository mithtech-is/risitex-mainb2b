import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260615150200 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "purchase_order" (
        "id" text not null,
        "customer_id" text not null,
        "company_id" text null,
        "order_id" text null,
        "po_number" text not null,
        "file_url" text null,
        "value_minor" numeric not null,
        "currency_code" text not null default 'inr',
        "expected_payment_date" timestamptz null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "purchase_order_pkey" primary key ("id")
      );
    `)
    this.addSql(`create index if not exists "IDX_purchase_order_customer_id" on "purchase_order" ("customer_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_purchase_order_company_id" on "purchase_order" ("company_id") where company_id is not null and deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_purchase_order_order_id" on "purchase_order" ("order_id") where order_id is not null and deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_purchase_order_po_number" on "purchase_order" ("po_number") where deleted_at is null;`)
  }
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "purchase_order" cascade;`)
  }
}
