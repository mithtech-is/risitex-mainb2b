import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260615150100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "matrix_order_session" (
        "id" text not null,
        "cart_id" text not null,
        "product_id" text not null,
        "grid" jsonb not null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "matrix_order_session_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create unique index if not exists "IDX_matrix_order_session_cart_product_unique"
        on "matrix_order_session" ("cart_id","product_id")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_matrix_order_session_cart"
        on "matrix_order_session" ("cart_id")
        where deleted_at is null;
    `)
  }
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "matrix_order_session" cascade;`)
  }
}
