import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Remove the retired referral / points-conversion schema from the wallet
 * module. Historical migrations still describe the old rollout path; this
 * migration is the live forward cleanup for B2B.
 */
export class Migration20260629010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      UPDATE "wallet_transaction"
      SET
        "metadata" = COALESCE("metadata", '{}'::jsonb) || jsonb_build_object('legacy_kind', "kind"),
        "kind" = 'manual_adjust'
      WHERE "kind" IN ('referral_credit', 'points_conversion');
    `)

    this.addSql(`
      ALTER TABLE IF EXISTS "wallet_transaction"
        DROP CONSTRAINT IF EXISTS "wallet_transaction_kind_check";
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "wallet_transaction"
        ADD CONSTRAINT "wallet_transaction_kind_check"
        CHECK ("kind" IN (
          'vba_credit',
          'order_debit',
          'order_reversal',
          'refund',
          'manual_adjust'
        ));
    `)

    this.addSql(`
      UPDATE "admin_audit_log"
      SET
        "action" = 'wallet_adjust',
        "reason_code" = COALESCE("reason_code", 'legacy_referral_reverse')
      WHERE "action" = 'referral_reverse';
    `)

    this.addSql(`
      ALTER TABLE IF EXISTS "admin_audit_log"
        DROP CONSTRAINT IF EXISTS "admin_audit_log_action_check";
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "admin_audit_log"
        ADD CONSTRAINT "admin_audit_log_action_check"
        CHECK ("action" IN (
          'kyc_edit',
          'kyc_approve',
          'kyc_reject',
          'wallet_adjust',
          'wallet_freeze',
          'wallet_unfreeze',
          'wallet_sync',
          'bank_verify',
          'bank_edit',
          'bank_delete',
          'demat_verify',
          'demat_edit',
          'demat_delete',
          'demat_set_primary',
          'order_cancel',
          'deposit_proof_decide',
          'company_request_decide',
          'document_upload',
          'document_delete',
          'customer_edit',
          'customer_hard_delete'
        ));
    `)

    this.addSql(`DROP TABLE IF EXISTS "referral" CASCADE;`)

    this.addSql(`
      ALTER TABLE IF EXISTS "cashfree_setting"
        DROP CONSTRAINT IF EXISTS "cashfree_setting_referrer_credit_bucket_check",
        DROP CONSTRAINT IF EXISTS "cashfree_setting_referee_credit_bucket_check";
    `)

    this.addSql(`
      ALTER TABLE IF EXISTS "cashfree_setting"
        DROP COLUMN IF EXISTS "referral_enabled",
        DROP COLUMN IF EXISTS "referral_min_purchase_inr",
        DROP COLUMN IF EXISTS "referral_referrer_min_purchase_inr",
        DROP COLUMN IF EXISTS "referral_referee_min_purchase_inr",
        DROP COLUMN IF EXISTS "referral_referrer_reward_inr",
        DROP COLUMN IF EXISTS "referral_referee_reward_inr",
        DROP COLUMN IF EXISTS "referral_reward_amount_inr",
        DROP COLUMN IF EXISTS "referrer_credit_bucket",
        DROP COLUMN IF EXISTS "referee_credit_bucket",
        DROP COLUMN IF EXISTS "points_conversion_enabled",
        DROP COLUMN IF EXISTS "points_per_inr",
        DROP COLUMN IF EXISTS "points_min_convert",
        DROP COLUMN IF EXISTS "points_max_convert";
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE IF EXISTS "wallet_transaction"
        DROP CONSTRAINT IF EXISTS "wallet_transaction_kind_check";
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "wallet_transaction"
        ADD CONSTRAINT "wallet_transaction_kind_check"
        CHECK ("kind" IN (
          'vba_credit',
          'order_debit',
          'order_reversal',
          'refund',
          'manual_adjust',
          'referral_credit',
          'points_conversion'
        ));
    `)

    this.addSql(`
      ALTER TABLE IF EXISTS "admin_audit_log"
        DROP CONSTRAINT IF EXISTS "admin_audit_log_action_check";
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "admin_audit_log"
        ADD CONSTRAINT "admin_audit_log_action_check"
        CHECK ("action" IN (
          'kyc_edit',
          'kyc_approve',
          'kyc_reject',
          'wallet_adjust',
          'wallet_freeze',
          'wallet_unfreeze',
          'wallet_sync',
          'bank_verify',
          'bank_edit',
          'bank_delete',
          'demat_verify',
          'demat_edit',
          'demat_delete',
          'demat_set_primary',
          'referral_reverse',
          'order_cancel',
          'deposit_proof_decide',
          'company_request_decide',
          'document_upload',
          'document_delete',
          'customer_edit',
          'customer_hard_delete'
        ));
    `)

    this.addSql(`
      CREATE TABLE IF NOT EXISTS "referral" (
        "id" text NOT NULL,
        "referrer_customer_id" text NOT NULL,
        "referred_customer_id" text NULL,
        "code" text NOT NULL,
        "status" text NOT NULL DEFAULT 'pending'
          CHECK ("status" IN ('pending', 'credited', 'expired', 'reversed')),
        "reward_amount_inr" integer NOT NULL DEFAULT 250,
        "first_order_subtotal_inr" integer NULL,
        "referrer_reward_inr" integer NOT NULL DEFAULT 250,
        "referee_reward_inr" integer NOT NULL DEFAULT 250,
        "first_trade_at" timestamptz NULL,
        "referee_credited_at" timestamptz NULL,
        "credited_at" timestamptz NULL,
        "reversed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "referral_pkey" PRIMARY KEY ("id")
      );
    `)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_referral_referrer_customer_id" ON "referral" ("referrer_customer_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_referral_code" ON "referral" ("code") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_referral_deleted_at" ON "referral" ("deleted_at") WHERE deleted_at IS NULL;`)

    this.addSql(`
      ALTER TABLE IF EXISTS "cashfree_setting"
        ADD COLUMN IF NOT EXISTS "referral_enabled" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "referral_min_purchase_inr" integer NOT NULL DEFAULT 10000,
        ADD COLUMN IF NOT EXISTS "referral_referrer_min_purchase_inr" integer,
        ADD COLUMN IF NOT EXISTS "referral_referee_min_purchase_inr" integer,
        ADD COLUMN IF NOT EXISTS "referral_referrer_reward_inr" integer NOT NULL DEFAULT 250,
        ADD COLUMN IF NOT EXISTS "referral_referee_reward_inr" integer NOT NULL DEFAULT 250,
        ADD COLUMN IF NOT EXISTS "referral_reward_amount_inr" integer NOT NULL DEFAULT 250,
        ADD COLUMN IF NOT EXISTS "referrer_credit_bucket" text NOT NULL DEFAULT 'promo',
        ADD COLUMN IF NOT EXISTS "referee_credit_bucket" text NOT NULL DEFAULT 'promo',
        ADD COLUMN IF NOT EXISTS "points_conversion_enabled" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "points_per_inr" integer NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS "points_min_convert" integer NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS "points_max_convert" integer NOT NULL DEFAULT 100000;
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "cashfree_setting"
        ADD CONSTRAINT "cashfree_setting_referrer_credit_bucket_check"
        CHECK ("referrer_credit_bucket" IN ('main', 'promo'));
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "cashfree_setting"
        ADD CONSTRAINT "cashfree_setting_referee_credit_bucket_check"
        CHECK ("referee_credit_bucket" IN ('main', 'promo'));
    `)
  }
}
