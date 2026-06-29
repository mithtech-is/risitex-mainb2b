import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260619060716 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shipment_transporter" drop constraint if exists "shipment_transporter_shipment_id_unique";`);
    this.addSql(`create table if not exists "shipment_transporter" ("id" text not null, "shipment_id" text not null, "transporter_code" text not null, "transporter_display_name" text null, "vehicle_number" text null, "awb" text null, "dispatched_at" timestamptz not null, "notes" text null, "live_status" text null, "live_status_raw" text null, "live_status_event" text null, "live_status_at" timestamptz null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "shipment_transporter_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_shipment_transporter_deleted_at" ON "shipment_transporter" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_shipment_transporter_shipment_id_unique" ON "shipment_transporter" ("shipment_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_shipment_transporter_transporter_code" ON "shipment_transporter" ("transporter_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_shipment_transporter_awb" ON "shipment_transporter" ("awb") WHERE awb IS NOT NULL AND deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "shipment_transporter" cascade;`);
  }

}
