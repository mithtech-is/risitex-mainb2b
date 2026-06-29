import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Initial sales_performance tables: sales_rep, sales_rep_assignment,
 * commission_rule, commission_record. See model files for semantics.
 *
 * SalesRepAssignment CHECK enforces "exactly one of customer_id /
 * company_id is set" — caught at DB level so a buggy admin endpoint
 * can't write a doubly-attributed row.
 *
 * CommissionRecord (earner_type, earner_id, idempotency_key) UNIQUE
 * partial index drives idempotency on subscriber replays.
 */
export class Migration20260615130000 extends Migration {
  override async up(): Promise<void> {
    // ── sales_rep ───────────────────────────────────────────────
    this.addSql(`
      create table if not exists "sales_rep" (
        "id" text not null,
        "employee_id" text not null,
        "name" text not null,
        "email" text not null,
        "phone" text null,
        "active" boolean not null default true,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "sales_rep_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create unique index if not exists "IDX_sales_rep_employee_id_unique"
        on "sales_rep" ("employee_id")
        where deleted_at is null;
    `)
    this.addSql(`
      create unique index if not exists "IDX_sales_rep_email_unique"
        on "sales_rep" ("email")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_sales_rep_active"
        on "sales_rep" ("active")
        where deleted_at is null;
    `)

    // ── sales_rep_assignment ───────────────────────────────────
    this.addSql(`
      create table if not exists "sales_rep_assignment" (
        "id" text not null,
        "sales_rep_id" text not null,
        "customer_id" text null,
        "company_id" text null,
        "assigned_at" timestamptz not null,
        "valid_until" timestamptz null,
        "notes" text null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "sales_rep_assignment_pkey" primary key ("id"),
        constraint "sales_rep_assignment_target_xor" check (
          (customer_id IS NULL) <> (company_id IS NULL)
        )
      );
    `)
    this.addSql(`
      create index if not exists "IDX_sales_rep_assignment_rep_id"
        on "sales_rep_assignment" ("sales_rep_id")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_sales_rep_assignment_customer_id"
        on "sales_rep_assignment" ("customer_id")
        where customer_id is not null and deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_sales_rep_assignment_company_id"
        on "sales_rep_assignment" ("company_id")
        where company_id is not null and deleted_at is null;
    `)

    // ── commission_rule ────────────────────────────────────────
    this.addSql(`
      create table if not exists "commission_rule" (
        "id" text not null,
        "name" text not null,
        "earner_type" text not null check ("earner_type" in ('sales_rep','affiliate')),
        "earner_id" text not null,
        "scope" text not null check ("scope" in ('first_order','restock','referral_first','custom')),
        "applies_to_company_id" text null,
        "applies_to_customer_tier_id" text null,
        "percent" numeric not null default 0,
        "flat_amount_minor" numeric null,
        "margin_basis" boolean not null default false,
        "effective_from" timestamptz not null,
        "effective_to" timestamptz null,
        "priority" integer not null default 0,
        "active" boolean not null default true,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "commission_rule_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index if not exists "IDX_commission_rule_earner_active"
        on "commission_rule" ("earner_type","earner_id","active")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_commission_rule_company"
        on "commission_rule" ("applies_to_company_id")
        where applies_to_company_id is not null and deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_commission_rule_tier"
        on "commission_rule" ("applies_to_customer_tier_id")
        where applies_to_customer_tier_id is not null and deleted_at is null;
    `)

    // ── commission_record ─────────────────────────────────────
    this.addSql(`
      create table if not exists "commission_record" (
        "id" text not null,
        "earner_type" text not null check ("earner_type" in ('sales_rep','affiliate')),
        "earner_id" text not null,
        "reference_type" text not null check ("reference_type" in ('order','refund','manual')),
        "reference_id" text not null,
        "amount_minor" numeric not null,
        "currency_code" text not null default 'inr',
        "status" text not null check ("status" in ('pending','paid','void')) default 'pending',
        "paid_wallet_transaction_id" text null,
        "paid_payout_id" text null,
        "earned_at" timestamptz not null,
        "paid_at" timestamptz null,
        "voided_at" timestamptz null,
        "voided_reason" text null,
        "idempotency_key" text not null,
        "rule_id" text not null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "commission_record_pkey" primary key ("id"),
        constraint "commission_record_rule_id_foreign" foreign key ("rule_id") references "commission_rule" ("id") on update cascade
      );
    `)
    this.addSql(`
      create unique index if not exists "IDX_commission_record_idempotency"
        on "commission_record" ("earner_type","earner_id","idempotency_key")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_commission_record_reference"
        on "commission_record" ("reference_type","reference_id")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_commission_record_earner_status"
        on "commission_record" ("earner_type","earner_id","status")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_commission_record_rule_id"
        on "commission_record" ("rule_id");
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "commission_record" cascade;`)
    this.addSql(`drop table if exists "commission_rule" cascade;`)
    this.addSql(`drop table if exists "sales_rep_assignment" cascade;`)
    this.addSql(`drop table if exists "sales_rep" cascade;`)
  }
}
