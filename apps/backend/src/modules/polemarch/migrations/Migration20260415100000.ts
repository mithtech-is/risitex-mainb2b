import { Migration } from "@mikro-orm/migrations"

/**
 * Drop the legacy `kyc_request` table.
 *
 * KYC has been fully replaced by Cashfree Secure ID — verifications now live
 * in the cashfree_wallet module's `secure_id_verification`, `bank_account`,
 * and `demat_account` tables. The old KycRequest model has been removed
 * from `src/modules/polemarch/index.js`, so this drop reconciles the DB
 * with the new model snapshot.
 *
 * `IF EXISTS` makes the migration safe to run on environments where the
 * table was never created (e.g. fresh installs after this change).
 */
export class Migration20260415100000 extends Migration {
  async up(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS "kyc_request" CASCADE;')
  }

  async down(): Promise<void> {
    // No down migration — this is a one-way deletion of dead data.
    // If you need historical KYC requests back, restore from a database
    // backup taken before this migration.
  }
}
