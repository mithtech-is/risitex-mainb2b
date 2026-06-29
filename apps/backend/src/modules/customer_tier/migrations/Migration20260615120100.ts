import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Initial customer_tier table. The seed script
 * (`src/scripts/seed-tiers.ts`) populates the three canonical RISITEX
 * tiers (local_mbo / high_footfall_mbo / regional_distributor) on
 * fresh boot.
 */
export class Migration20260615120100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "customer_tier" (
        "id" text not null,
        "code" text not null,
        "name" text not null,
        "priority" integer not null default 0,
        "default_payment_terms" text not null default 'advance_100',
        "default_commission_percent" numeric not null default 0,
        "active" boolean not null default true,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "customer_tier_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create unique index if not exists "IDX_customer_tier_code_unique"
        on "customer_tier" ("code")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_customer_tier_active"
        on "customer_tier" ("active")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_customer_tier_deleted_at"
        on "customer_tier" ("deleted_at")
        where deleted_at is not null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "customer_tier" cascade;`)
  }
}
