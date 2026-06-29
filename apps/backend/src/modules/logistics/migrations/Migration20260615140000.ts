import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260615140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "shipment_transporter" (
        "id" text not null,
        "shipment_id" text not null,
        "transporter_code" text not null,
        "transporter_display_name" text null,
        "vehicle_number" text null,
        "awb" text null,
        "dispatched_at" timestamptz not null,
        "notes" text null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "shipment_transporter_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create unique index if not exists "IDX_shipment_transporter_shipment_id_unique"
        on "shipment_transporter" ("shipment_id")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_shipment_transporter_code"
        on "shipment_transporter" ("transporter_code")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_shipment_transporter_awb"
        on "shipment_transporter" ("awb")
        where awb is not null and deleted_at is null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "shipment_transporter" cascade;`)
  }
}
