import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260615140100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "backorder_request" (
        "id" text not null,
        "order_id" text not null,
        "line_id" text not null,
        "sku" text not null,
        "qty" integer not null,
        "eta" timestamptz null,
        "jira_ticket_id" text null,
        "status" text not null check ("status" in ('pending','in_prod','fulfilled','cancelled')) default 'pending',
        "cancelled_reason" text null,
        "cancelled_at" timestamptz null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "backorder_request_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index if not exists "IDX_backorder_request_order_id"
        on "backorder_request" ("order_id")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_backorder_request_sku"
        on "backorder_request" ("sku")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_backorder_request_status"
        on "backorder_request" ("status")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_backorder_request_jira_ticket_id"
        on "backorder_request" ("jira_ticket_id")
        where jira_ticket_id is not null and deleted_at is null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "backorder_request" cascade;`)
  }
}
