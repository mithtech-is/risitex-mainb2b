-- 0004: sales reps + assignments + impersonation + per-company credit override
--
-- Sales reps are Medusa admin users with an extended profile and commission scheme.
-- Impersonation tracks "rep is placing an order on behalf of a customer".

BEGIN;

CREATE TABLE risitex_org.sales_reps (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  medusa_user_id              TEXT         NOT NULL UNIQUE,
  employee_code               TEXT         UNIQUE,
  display_name                TEXT         NOT NULL,
  email                       CITEXT       NOT NULL,
  phone                       TEXT,
  territory                   TEXT,
  base_commission_percent     NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (base_commission_percent >= 0 AND base_commission_percent <= 100),
  active                      BOOLEAN      NOT NULL DEFAULT TRUE,
  hired_at                    DATE,
  metadata                    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_reps_active ON risitex_org.sales_reps (active) WHERE active;

COMMENT ON TABLE risitex_org.sales_reps IS 'Extended profile for Medusa admin users acting as sales reps.';

CREATE TABLE risitex_org.sales_rep_assignments (
  sales_rep_id   UUID         NOT NULL REFERENCES risitex_org.sales_reps(id) ON DELETE CASCADE,
  company_id     UUID         NOT NULL REFERENCES risitex_org.companies(id) ON DELETE CASCADE,
  assigned_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  is_primary     BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (sales_rep_id, company_id)
);

CREATE INDEX idx_sales_rep_assignments_company ON risitex_org.sales_rep_assignments (company_id);

-- Impersonation audit: when a rep places orders as a customer
CREATE TABLE risitex_org.sales_rep_impersonations (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id    UUID         NOT NULL REFERENCES risitex_org.sales_reps(id) ON DELETE CASCADE,
  company_id      UUID         NOT NULL REFERENCES risitex_org.companies(id) ON DELETE CASCADE,
  customer_id     TEXT,
  session_token   TEXT         NOT NULL UNIQUE,
  started_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  ended_reason    TEXT,
  ip_address      INET,
  user_agent      TEXT
);

CREATE INDEX idx_impersonations_active_rep ON risitex_org.sales_rep_impersonations (sales_rep_id) WHERE ended_at IS NULL;
CREATE INDEX idx_impersonations_active_company ON risitex_org.sales_rep_impersonations (company_id) WHERE ended_at IS NULL;

COMMENT ON TABLE risitex_org.sales_rep_impersonations IS 'Audit trail for rep-acting-as-customer sessions. Used for commission attribution + compliance.';

-- Credit limit override per company (overrides the tier default)
CREATE TABLE risitex_org.company_credit_limits (
  company_id                  UUID          PRIMARY KEY REFERENCES risitex_org.companies(id) ON DELETE CASCADE,
  credit_limit_inr            NUMERIC(14,2) NOT NULL CHECK (credit_limit_inr >= 0),
  outstanding_balance_inr     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (outstanding_balance_inr >= 0),
  payment_terms_days          INT           NOT NULL CHECK (payment_terms_days >= 0),
  last_recalculated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  source                      TEXT          NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'erp', 'tier_default')),
  metadata                    JSONB         NOT NULL DEFAULT '{}'::jsonb,
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE risitex_org.company_credit_limits IS 'Per-company override of the tier-default credit limit. Outstanding balance synced from ERPNext.';

COMMIT;
