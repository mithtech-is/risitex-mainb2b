import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260615150300 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "credit_terms" (
        "id" text not null,
        "code" text not null,
        "name" text not null,
        "days" integer not null default 0,
        "advance_pct" integer not null default 100,
        "max_outstanding_minor" numeric null,
        "active" boolean not null default true,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "credit_terms_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create unique index if not exists "IDX_credit_terms_code_unique"
        on "credit_terms" ("code") where deleted_at is null;
    `)
  }
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "credit_terms" cascade;`)
  }
}
