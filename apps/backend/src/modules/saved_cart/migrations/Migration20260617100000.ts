import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260617100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "saved_cart"
        add column if not exists "share_token" text null;
    `)
    this.addSql(`
      alter table "saved_cart"
        add column if not exists "share_token_created_at" timestamptz null;
    `)
    this.addSql(`
      create unique index if not exists "IDX_saved_cart_share_token"
        on "saved_cart" ("share_token")
        where share_token is not null and deleted_at is null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`
      drop index if exists "IDX_saved_cart_share_token";
    `)
    this.addSql(`
      alter table "saved_cart" drop column if exists "share_token_created_at";
    `)
    this.addSql(`
      alter table "saved_cart" drop column if exists "share_token";
    `)
  }
}
