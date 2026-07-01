import { Migration } from "@mikro-orm/migrations"

export class Migration20260630000001 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "product_review" (
        "id" text not null,
        "product_id" text not null,
        "customer_name" text not null,
        "customer_email" text not null,
        "customer_id" text null,
        "rating" integer not null,
        "title" text null,
        "body" text not null,
        "is_public" boolean not null default false,
        "moderated_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "product_review_pkey" primary key ("id")
      )
    `)
    this.addSql(`
      create index if not exists "product_review_product_id_is_public_index"
        on "product_review" ("product_id", "is_public")
    `)
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "product_review"`)
  }
}
