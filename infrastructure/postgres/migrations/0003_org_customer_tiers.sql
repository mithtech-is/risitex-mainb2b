-- 0003: risitex_org.customer_tiers + company_tier_assignments
--
-- Customer tiers (Bronze/Silver/Gold/Platinum etc.) drive pricing, MOQ, credit.

BEGIN;

CREATE TABLE risitex_org.customer_tiers (
  id                              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code                            TEXT         NOT NULL UNIQUE,
  display_name                    TEXT         NOT NULL,
  rank                            INT          NOT NULL UNIQUE,
  applies_to                      TEXT         NOT NULL CHECK (applies_to IN ('b2b', 'b2c', 'both')),

  -- Pricing
  discount_percent                NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 100),

  -- MOQ multiplier: 1.0 = standard, 0.5 = half (premium tiers get smaller MOQ)
  moq_multiplier                  NUMERIC(5,2) NOT NULL DEFAULT 1
    CHECK (moq_multiplier > 0),

  -- Credit
  default_credit_limit_inr        NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_payment_terms_days       INT          NOT NULL DEFAULT 0,

  -- Visibility flags
  can_see_wholesale_pricing       BOOLEAN      NOT NULL DEFAULT FALSE,

  metadata                        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at                      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  risitex_org.customer_tiers IS 'Customer tier definitions. Higher rank = better tier.';
COMMENT ON COLUMN risitex_org.customer_tiers.moq_multiplier IS 'Multiplier applied to base MOQ. 1.0 = standard. Lower = better.';

-- Seed tiers (ON CONFLICT in case migration is replayed by hand)
INSERT INTO risitex_org.customer_tiers
  (code,       display_name,           rank, applies_to, discount_percent, default_credit_limit_inr, credit_payment_terms_days, can_see_wholesale_pricing)
VALUES
  ('retail',   'Retail (B2C)',           1, 'b2c',  0,        0,    0, FALSE),
  ('bronze',   'Bronze Wholesale',      10, 'b2b',  5,    50000,   15, TRUE),
  ('silver',   'Silver Wholesale',      20, 'b2b',  8,   200000,   30, TRUE),
  ('gold',     'Gold Wholesale',        30, 'b2b', 12,   500000,   45, TRUE),
  ('platinum', 'Platinum Wholesale',    40, 'b2b', 18,  2000000,   60, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Tier assignments per company (one tier per company; history goes to audit log)
CREATE TABLE risitex_org.company_tier_assignments (
  company_id            UUID         PRIMARY KEY REFERENCES risitex_org.companies(id) ON DELETE CASCADE,
  tier_id               UUID         NOT NULL REFERENCES risitex_org.customer_tiers(id),
  assigned_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  assigned_by_user_id   TEXT,
  reason                TEXT
);

CREATE INDEX idx_company_tier_assignments_tier ON risitex_org.company_tier_assignments (tier_id);

COMMENT ON TABLE risitex_org.company_tier_assignments IS 'Current tier per company. Past tiers live in audit log.';

-- Now wire the FK on companies.tier_id (couldn't do in 0002, tiers didn't exist)
ALTER TABLE risitex_org.companies
  ADD CONSTRAINT fk_companies_tier
  FOREIGN KEY (tier_id) REFERENCES risitex_org.customer_tiers(id) ON DELETE SET NULL;

COMMIT;
