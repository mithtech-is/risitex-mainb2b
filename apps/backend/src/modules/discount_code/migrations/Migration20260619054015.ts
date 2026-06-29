import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260619054015 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "discount_code" add column if not exists "combinable_tier_ids" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "discount_code" drop column if exists "combinable_tier_ids";`);
  }

}
