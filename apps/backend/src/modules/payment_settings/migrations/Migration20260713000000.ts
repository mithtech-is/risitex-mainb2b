import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260713000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "payment_setting" (
        "id" text not null,
        "manual_upi_enabled" boolean not null default true,
        "razorpay_enabled" boolean not null default true,
        "upi_id" text not null default 'risitex@upi',
        "upi_qr_image_url" text null,
        "gateway_charge_percent" numeric not null default 2,
        "razorpay_mode" text not null default 'sandbox',
        "auto_capture" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "payment_setting_pkey" primary key ("id")
      );
    `)
    // Seed the canonical single row so GET works before any admin save.
    this.addSql(`
      insert into "payment_setting" ("id") values ('payment_settings')
      on conflict ("id") do nothing;
    `)
  }
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "payment_setting" cascade;`)
  }
}
