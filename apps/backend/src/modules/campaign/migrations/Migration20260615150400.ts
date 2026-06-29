import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260615150400 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "marketing_campaign" (
        "id" text not null,
        "code" text not null,
        "name" text not null,
        "source" text null,
        "starts_at" timestamptz not null,
        "ends_at" timestamptz null,
        "target_metric" text null,
        "active" boolean not null default true,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "campaign_pkey" primary key ("id")
      );
    `)
    this.addSql(`create index if not exists "IDX_campaign_code" on "marketing_campaign" ("code") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_campaign_active" on "marketing_campaign" ("active") where deleted_at is null;`)

    this.addSql(`
      create table if not exists "marketing_campaign_attribution" (
        "id" text not null,
        "campaign_id" text not null,
        "order_id" text not null,
        "customer_id" text null,
        "code" text not null,
        "captured_at" timestamptz not null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "campaign_attribution_pkey" primary key ("id"),
        constraint "campaign_attribution_campaign_fk" foreign key ("campaign_id") references "marketing_campaign" ("id") on update cascade
      );
    `)
    this.addSql(`create index if not exists "IDX_campaign_attribution_order" on "marketing_campaign_attribution" ("order_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_campaign_attribution_customer" on "marketing_campaign_attribution" ("customer_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_campaign_attribution_campaign" on "marketing_campaign_attribution" ("campaign_id");`)
  }
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "marketing_campaign_attribution" cascade;`)
    this.addSql(`drop table if exists "marketing_campaign" cascade;`)
  }
}
