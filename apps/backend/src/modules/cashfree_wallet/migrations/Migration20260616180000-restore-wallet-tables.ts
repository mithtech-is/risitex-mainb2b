import { Migration } from "@mikro-orm/migrations"

/**
 * Restore the `bank_account` + `deposit_proof` tables that the
 * 2026-06-15 polemarch-purge SQL dropped together with the equity-
 * specific tables. Both are still load-bearing for RISITEX:
 *
 *   bank_account   — customer's source-of-funds for wallet top-ups
 *                    + the anchor for the Cashfree VBA provisioning.
 *   deposit_proof  — manual top-up flow (NEFT / IMPS receipt upload)
 *                    that admin approves to credit the wallet.
 *
 * The equity-specific tables (aadhaar_record, pan_record, cmr_record,
 * demat_account, bank_record, secure_id_verification, manual_kyc_
 * request) stay dropped — they're not in scope for textile B2B/B2C.
 *
 * Schemas match the model definitions current at this commit:
 *   - bank_account columns include `bank_hash`, `bank_proof_file_url`,
 *     and `bank_proof_type` (added by later cashfree_wallet migrations
 *     that have already been recorded in mikro_orm_migrations).
 *   - deposit_proof matches the model exactly.
 *
 * Idempotent via CREATE TABLE IF NOT EXISTS — re-running on a freshly
 * provisioned database that DOES have the tables is a no-op.
 */
export class Migration20260616180000 extends Migration {
    override async up(): Promise<void> {
        // ── bank_account ───────────────────────────────────────────
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "bank_account" (
                "id" TEXT NOT NULL,
                "customer_id" TEXT NOT NULL,
                "account_holder_name" TEXT NOT NULL,
                "account_number_encrypted" TEXT NOT NULL,
                "account_number_last4" TEXT NOT NULL,
                "ifsc" TEXT NOT NULL,
                "bank_name" TEXT NULL,
                "name_match_score" NUMERIC NULL,
                "verification_status" TEXT NOT NULL DEFAULT 'pending'
                    CHECK ("verification_status" IN ('pending', 'verified', 'failed', 'name_mismatch')),
                "cashfree_reference_id" TEXT NULL,
                "verification_raw" JSONB NULL,
                "verified_at" TIMESTAMPTZ NULL,
                "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
                "bank_hash" TEXT NULL,
                "bank_proof_file_url" TEXT NULL,
                "bank_proof_type" TEXT NULL
                    CHECK ("bank_proof_type" IS NULL OR "bank_proof_type" IN ('cheque', 'passbook', 'statement')),
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMPTZ NULL,
                CONSTRAINT "bank_account_pkey" PRIMARY KEY ("id")
            );
        `)
        this.addSql(`
            CREATE INDEX IF NOT EXISTS "IDX_bank_account_customer_id"
                ON "bank_account" ("customer_id")
                WHERE "deleted_at" IS NULL;
        `)
        this.addSql(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bank_account_primary_uq"
                ON "bank_account" ("customer_id")
                WHERE "is_primary" = TRUE AND "deleted_at" IS NULL;
        `)
        this.addSql(`
            CREATE INDEX IF NOT EXISTS "IDX_bank_account_hash"
                ON "bank_account" ("bank_hash")
                WHERE "deleted_at" IS NULL;
        `)

        // ── deposit_proof ──────────────────────────────────────────
        this.addSql(`
            CREATE TABLE IF NOT EXISTS "deposit_proof" (
                "id" TEXT NOT NULL,
                "customer_id" TEXT NOT NULL,
                "claimed_amount_inr" BIGINT NOT NULL,
                "credited_amount_inr" BIGINT NULL,
                "utr" TEXT NULL,
                "customer_note" TEXT NULL,
                "proof_file_url" TEXT NOT NULL,
                "status" TEXT NOT NULL DEFAULT 'pending'
                    CHECK ("status" IN ('pending', 'approved', 'rejected')),
                "reviewer_user_id" TEXT NULL,
                "reviewer_notes" TEXT NULL,
                "reviewed_at" TIMESTAMPTZ NULL,
                "wallet_transaction_id" TEXT NULL,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMPTZ NULL,
                CONSTRAINT "deposit_proof_pkey" PRIMARY KEY ("id")
            );
        `)
        this.addSql(`
            CREATE INDEX IF NOT EXISTS "IDX_deposit_proof_customer_id"
                ON "deposit_proof" ("customer_id")
                WHERE "deleted_at" IS NULL;
        `)
        this.addSql(`
            CREATE INDEX IF NOT EXISTS "IDX_deposit_proof_status_created"
                ON "deposit_proof" ("status", "created_at")
                WHERE "deleted_at" IS NULL;
        `)
    }

    override async down(): Promise<void> {
        this.addSql(`DROP TABLE IF EXISTS "deposit_proof" CASCADE;`)
        this.addSql(`DROP TABLE IF EXISTS "bank_account" CASCADE;`)
    }
}
