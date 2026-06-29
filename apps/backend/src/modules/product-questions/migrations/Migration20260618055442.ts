import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260618055442 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "product_question" ("id" text not null, "product_id" text not null, "customer_name" text not null, "customer_email" text not null, "question" text not null, "answer" text null, "is_public" boolean not null default false, "answered_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_question_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_question_deleted_at" ON "product_question" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_question_product_id_is_public" ON "product_question" ("product_id", "is_public") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product_question" cascade;`);
  }

}
