import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * `b2b_pricing` module — RISITEX B2B Pricing & Rules engine. Creates the
 * five engine tables ported from Holisto `b2b_rules`, with the Holisto
 * `customer_group_id` columns renamed to `customer_tier_id` (RISITEX drives
 * pricing off customer_tier). `category_id` + `price_list_id` on the price
 * tier (Holisto's later additive migrations) are folded in here.
 */
export class Migration20260617170000 extends Migration {
  override async up(): Promise<void> {
    // ── b2b_dynamic_rule ───────────────────────────────────────────
    this.addSql(`
      create table if not exists "b2b_dynamic_rule" (
        "id" text not null,
        "title" text not null,
        "enabled" boolean not null default true,
        "rule_what" text not null default 'discount_percentage',
        "rule_who" text not null default 'all_registered',
        "who_ids" jsonb null,
        "rule_applies" text not null default 'cart_total',
        "applies_ids" jsonb null,
        "how_much" numeric null,
        "value_type" text null,
        "discount_show_everywhere" boolean not null default false,
        "discount_name" text null,
        "tax_name" text null,
        "payment_provider_id" text null,
        "priority" integer not null default 0,
        "extra" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "b2b_dynamic_rule_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index if not exists "IDX_b2b_dynamic_rule_what"
        on "b2b_dynamic_rule" ("rule_what") where "deleted_at" is null;
    `)

    // ── b2b_rule_condition ─────────────────────────────────────────
    this.addSql(`
      create table if not exists "b2b_rule_condition" (
        "id" text not null,
        "rule_id" text not null,
        "dimension" text not null default 'cart_total_value',
        "operator" text not null default 'gte',
        "threshold" numeric not null default 0,
        "target_id" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "b2b_rule_condition_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index if not exists "IDX_b2b_rule_condition_rule"
        on "b2b_rule_condition" ("rule_id") where "deleted_at" is null;
    `)

    // ── b2b_price_tier ─────────────────────────────────────────────
    this.addSql(`
      create table if not exists "b2b_price_tier" (
        "id" text not null,
        "rule_id" text null,
        "product_id" text null,
        "variant_id" text null,
        "category_id" text null,
        "customer_tier_id" text null,
        "region_id" text null,
        "min_quantity" integer not null default 1,
        "max_quantity" integer null,
        "value" numeric not null default 0,
        "is_percentage" boolean not null default false,
        "price_list_id" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "b2b_price_tier_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index if not exists "IDX_b2b_price_tier_rule"
        on "b2b_price_tier" ("rule_id") where "deleted_at" is null;
    `)
    this.addSql(`
      create index if not exists "IDX_b2b_price_tier_product"
        on "b2b_price_tier" ("product_id") where "deleted_at" is null;
    `)
    this.addSql(`
      create index if not exists "IDX_b2b_price_tier_category"
        on "b2b_price_tier" ("category_id") where "deleted_at" is null;
    `)
    this.addSql(`
      create index if not exists "IDX_b2b_price_tier_region"
        on "b2b_price_tier" ("region_id") where "deleted_at" is null;
    `)

    // ── b2b_product_quantity_rule ──────────────────────────────────
    this.addSql(`
      create table if not exists "b2b_product_quantity_rule" (
        "id" text not null,
        "product_id" text not null,
        "variant_id" text null,
        "customer_tier_id" text null,
        "min_qty" integer null,
        "max_qty" integer null,
        "step_qty" integer null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "b2b_product_quantity_rule_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index if not exists "IDX_b2b_pqr_product"
        on "b2b_product_quantity_rule" ("product_id") where "deleted_at" is null;
    `)

    // ── b2b_product_visibility_rule ────────────────────────────────
    this.addSql(`
      create table if not exists "b2b_product_visibility_rule" (
        "id" text not null,
        "target_type" text not null default 'product',
        "product_id" text null,
        "category_id" text null,
        "customer_tier_id" text null,
        "specific_customer_id" text null,
        "visible" boolean not null default true,
        "mode" text not null default 'manual',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "b2b_product_visibility_rule_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index if not exists "IDX_b2b_pvr_product"
        on "b2b_product_visibility_rule" ("product_id") where "deleted_at" is null;
    `)
    this.addSql(`
      create index if not exists "IDX_b2b_pvr_category"
        on "b2b_product_visibility_rule" ("category_id") where "deleted_at" is null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "b2b_dynamic_rule" cascade;`)
    this.addSql(`drop table if exists "b2b_rule_condition" cascade;`)
    this.addSql(`drop table if exists "b2b_price_tier" cascade;`)
    this.addSql(`drop table if exists "b2b_product_quantity_rule" cascade;`)
    this.addSql(`drop table if exists "b2b_product_visibility_rule" cascade;`)
  }
}
