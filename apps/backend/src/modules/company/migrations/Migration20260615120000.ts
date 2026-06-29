import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Initial company + company_application tables.
 *
 * `company` is the canonical B2B account entity (FR-1.02). One row
 * per approved GSTIN. UNIQUE constraint on gstin prevents the same
 * organisation registering twice.
 *
 * `company_application` is the open-intake landing zone for new
 * registrations. Pending applications are reviewed in the admin
 * (/app/companies/applications); approved ones produce a company
 * row + a Medusa customer + customer.company_id linkage (handled by
 * the admin route, not this migration).
 */
export class Migration20260615120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "company" (
        "id" text not null,
        "gstin" text not null,
        "trade_name" text not null,
        "billing_address" jsonb not null,
        "status" text not null check ("status" in ('pending','approved','rejected','suspended')) default 'pending',
        "customer_tier_id" text null,
        "credit_terms_id" text null,
        "sales_rep_id" text null,
        "review_notes" text null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "company_pkey" primary key ("id")
      );
    `)

    this.addSql(`
      create unique index if not exists "IDX_company_gstin_unique"
        on "company" ("gstin")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_company_status"
        on "company" ("status")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_company_customer_tier_id"
        on "company" ("customer_tier_id")
        where customer_tier_id is not null and deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_company_sales_rep_id"
        on "company" ("sales_rep_id")
        where sales_rep_id is not null and deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_company_deleted_at"
        on "company" ("deleted_at")
        where deleted_at is not null;
    `)

    this.addSql(`
      create table if not exists "company_application" (
        "id" text not null,
        "gstin" text not null,
        "trade_name" text not null,
        "applicant_email" text not null,
        "applicant_phone" text null,
        "payload" jsonb not null,
        "status" text not null check ("status" in ('pending','approved','rejected')) default 'pending',
        "reviewer_id" text null,
        "review_notes" text null,
        "reviewed_at" timestamptz null,
        "resulting_company_id" text null,
        "ip_hash" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "company_application_pkey" primary key ("id")
      );
    `)
    this.addSql(`
      create index if not exists "IDX_company_application_status"
        on "company_application" ("status")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_company_application_applicant_email"
        on "company_application" ("applicant_email")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_company_application_gstin"
        on "company_application" ("gstin")
        where deleted_at is null;
    `)
    this.addSql(`
      create index if not exists "IDX_company_application_deleted_at"
        on "company_application" ("deleted_at")
        where deleted_at is not null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "company_application" cascade;`)
    this.addSql(`drop table if exists "company" cascade;`)
  }
}
