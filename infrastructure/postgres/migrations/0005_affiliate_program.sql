-- 0005: affiliate program — affiliates, referrals, wallets, commissions, payouts
--
-- An affiliate is one of: a Medusa customer, a sales rep, or an external partner.
-- Referrals track who they brought in. Wallets hold balances (also for customers/companies).
-- Commission rules + commission records + payouts form the payout pipeline.

BEGIN;

-- Affiliates
CREATE TABLE risitex_affiliate.affiliates (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one of these three must be set
  customer_id              TEXT,
  sales_rep_id             UUID         REFERENCES risitex_org.sales_reps(id) ON DELETE SET NULL,
  external_partner_id      TEXT,

  display_name             TEXT         NOT NULL,
  email                    CITEXT       NOT NULL,
  phone                    TEXT,
  referral_code            TEXT         NOT NULL UNIQUE,

  commission_percent       NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (commission_percent >= 0 AND commission_percent <= 100),

  status                   TEXT         NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'paused', 'terminated')),
  approved_at              TIMESTAMPTZ,

  payout_method            TEXT         CHECK (payout_method IN ('wallet', 'bank_transfer', 'razorpay_route', 'upi')),
  payout_details           JSONB,

  metadata                 JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_affiliate_subject_exclusive CHECK (
    (customer_id          IS NOT NULL)::int +
    (sales_rep_id         IS NOT NULL)::int +
    (external_partner_id  IS NOT NULL)::int = 1
  )
);

CREATE INDEX idx_affiliates_referral_code ON risitex_affiliate.affiliates (referral_code);
CREATE INDEX idx_affiliates_status        ON risitex_affiliate.affiliates (status);
CREATE INDEX idx_affiliates_customer      ON risitex_affiliate.affiliates (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_affiliates_sales_rep     ON risitex_affiliate.affiliates (sales_rep_id) WHERE sales_rep_id IS NOT NULL;

-- Referrals
CREATE TABLE risitex_affiliate.referrals (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id                UUID         NOT NULL REFERENCES risitex_affiliate.affiliates(id) ON DELETE CASCADE,

  -- At least one of these (customer for B2C, company for B2B)
  referred_customer_id        TEXT,
  referred_company_id         UUID         REFERENCES risitex_org.companies(id) ON DELETE SET NULL,

  referred_at                 TIMESTAMPTZ  NOT NULL DEFAULT now(),
  source_channel              TEXT         CHECK (source_channel IN ('link', 'qr', 'manual', 'whatsapp', 'sms', 'email')),
  source_metadata             JSONB,

  attribution_window_days     INT          NOT NULL DEFAULT 30 CHECK (attribution_window_days > 0),
  status                      TEXT         NOT NULL DEFAULT 'tracked'
    CHECK (status IN ('tracked', 'converted', 'expired')),
  converted_at                TIMESTAMPTZ,

  CONSTRAINT chk_referral_target CHECK (referred_customer_id IS NOT NULL OR referred_company_id IS NOT NULL)
);

CREATE INDEX idx_referrals_affiliate ON risitex_affiliate.referrals (affiliate_id);
CREATE INDEX idx_referrals_status    ON risitex_affiliate.referrals (status);

-- Wallets (balance ledger for affiliates / customers / companies)
CREATE TABLE risitex_affiliate.wallets (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one owner
  customer_id              TEXT,
  affiliate_id             UUID         REFERENCES risitex_affiliate.affiliates(id) ON DELETE CASCADE,
  company_id               UUID         REFERENCES risitex_org.companies(id) ON DELETE CASCADE,

  currency                 TEXT         NOT NULL DEFAULT 'INR',
  balance_minor_units      BIGINT       NOT NULL DEFAULT 0,
  locked_minor_units       BIGINT       NOT NULL DEFAULT 0 CHECK (locked_minor_units >= 0),

  metadata                 JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_wallet_owner_exclusive CHECK (
    (customer_id  IS NOT NULL)::int +
    (affiliate_id IS NOT NULL)::int +
    (company_id   IS NOT NULL)::int = 1
  )
);

-- One wallet per owner per currency
CREATE UNIQUE INDEX uniq_wallet_per_customer  ON risitex_affiliate.wallets (customer_id,  currency) WHERE customer_id  IS NOT NULL;
CREATE UNIQUE INDEX uniq_wallet_per_affiliate ON risitex_affiliate.wallets (affiliate_id, currency) WHERE affiliate_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_wallet_per_company   ON risitex_affiliate.wallets (company_id,   currency) WHERE company_id   IS NOT NULL;

COMMENT ON COLUMN risitex_affiliate.wallets.balance_minor_units IS 'Balance in the smallest currency unit (paise for INR). Use bigint to avoid rounding bugs.';

-- Wallet transactions (immutable ledger)
CREATE TABLE risitex_affiliate.wallet_transactions (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id                   UUID         NOT NULL REFERENCES risitex_affiliate.wallets(id) ON DELETE CASCADE,

  amount_minor_units          BIGINT       NOT NULL CHECK (amount_minor_units <> 0),
  balance_after_minor_units   BIGINT       NOT NULL,

  reason                      TEXT         NOT NULL CHECK (reason IN (
    'commission_earned', 'commission_reversed',
    'payout_pending', 'payout_completed', 'payout_failed',
    'manual_adjustment', 'refund', 'order_settlement'
  )),
  reference_type              TEXT,
  reference_id                TEXT,
  idempotency_key             TEXT UNIQUE,
  notes                       TEXT,
  created_by_user_id          TEXT,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_txn_wallet_created  ON risitex_affiliate.wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX idx_wallet_txn_reason          ON risitex_affiliate.wallet_transactions (reason);

COMMENT ON TABLE risitex_affiliate.wallet_transactions IS 'Immutable wallet ledger. Positive amount = credit. Never UPDATE/DELETE.';

-- Commission rules (which percentage applies when)
CREATE TABLE risitex_affiliate.commission_rules (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                       TEXT         NOT NULL CHECK (scope IN ('default', 'tier', 'affiliate', 'product_category', 'product')),
  scope_ref_id                TEXT,
  commission_percent          NUMERIC(5,2) NOT NULL CHECK (commission_percent >= 0 AND commission_percent <= 100),
  min_order_value_inr         NUMERIC(14,2),
  max_payout_per_order_inr    NUMERIC(14,2),
  effective_from              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  effective_to                TIMESTAMPTZ,
  priority                    INT          NOT NULL DEFAULT 0,
  active                      BOOLEAN      NOT NULL DEFAULT TRUE,
  metadata                    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_commission_rules_lookup
  ON risitex_affiliate.commission_rules (scope, scope_ref_id, priority DESC, effective_from DESC)
  WHERE active;

-- Earned commissions (one per order per affiliate)
CREATE TABLE risitex_affiliate.commissions (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id             UUID          NOT NULL REFERENCES risitex_affiliate.affiliates(id) ON DELETE RESTRICT,
  referral_id              UUID          REFERENCES risitex_affiliate.referrals(id) ON DELETE SET NULL,
  order_id                 TEXT          NOT NULL,
  rule_id                  UUID          REFERENCES risitex_affiliate.commission_rules(id),
  computed_percent         NUMERIC(5,2)  NOT NULL,
  order_total_inr          NUMERIC(14,2) NOT NULL,
  commission_inr           NUMERIC(14,2) NOT NULL,
  status                   TEXT          NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'reversed', 'disputed')),
  approved_at              TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  payout_id                UUID,         -- FK added below
  notes                    TEXT,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_commissions_affiliate_status ON risitex_affiliate.commissions (affiliate_id, status);
CREATE INDEX idx_commissions_order            ON risitex_affiliate.commissions (order_id);

-- Payouts (a batched payment to an affiliate)
CREATE TABLE risitex_affiliate.payouts (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id        UUID          NOT NULL REFERENCES risitex_affiliate.affiliates(id) ON DELETE RESTRICT,
  total_inr           NUMERIC(14,2) NOT NULL CHECK (total_inr > 0),
  method              TEXT          NOT NULL,
  status              TEXT          NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  initiated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  failure_reason      TEXT,
  external_ref        TEXT,
  metadata            JSONB         NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_payouts_affiliate_status ON risitex_affiliate.payouts (affiliate_id, status);

-- Now we can wire commissions.payout_id -> payouts.id
ALTER TABLE risitex_affiliate.commissions
  ADD CONSTRAINT fk_commission_payout
  FOREIGN KEY (payout_id) REFERENCES risitex_affiliate.payouts(id) ON DELETE SET NULL;

COMMIT;
