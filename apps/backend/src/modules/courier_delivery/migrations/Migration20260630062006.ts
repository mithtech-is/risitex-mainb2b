import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260630062006 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "courier_rate" drop constraint if exists "courier_rate_carrier_code_zone_unique";`);
    this.addSql(`create table if not exists "courier_rate" ("id" text not null, "carrier_code" text not null, "carrier_name" text not null, "zone" text not null, "base_rate_paise" numeric not null, "per_kg_rate_paise" numeric null, "per_carton_rate_paise" numeric null, "min_delivery_days" integer not null, "max_delivery_days" integer not null, "cod_surcharge_paise" numeric not null default 0, "fuel_surcharge_pct" integer not null default 0, "is_active" boolean not null default true, "metadata" jsonb null, "raw_base_rate_paise" jsonb not null, "raw_per_kg_rate_paise" jsonb null, "raw_per_carton_rate_paise" jsonb null, "raw_cod_surcharge_paise" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "courier_rate_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_courier_rate_deleted_at" ON "courier_rate" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_courier_rate_carrier_code_zone_unique" ON "courier_rate" ("carrier_code", "zone") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_courier_rate_zone" ON "courier_rate" ("zone") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "courier_rate" cascade;`);
  }

}
