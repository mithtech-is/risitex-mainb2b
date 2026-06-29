-- 0002: risitex_org.companies + company_members
--
-- B2B customer companies. A company has many members (Medusa customers with a role).

BEGIN;

CREATE TABLE risitex_org.companies (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name            TEXT         NOT NULL,
  display_name          TEXT         NOT NULL,
  gstin                 TEXT,
  pan                   TEXT,
  email                 CITEXT       NOT NULL,
  phone                 TEXT,
  billing_address       JSONB,
  shipping_address      JSONB,

  approval_status       TEXT         NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended')),
  approved_at           TIMESTAMPTZ,
  approved_by_user_id   TEXT,
  rejected_reason       TEXT,

  -- Soft references to Medusa entities (Medusa IDs are TEXT, no FK to allow Medusa to evolve)
  primary_customer_id   TEXT,
  tier_id               UUID,        -- FK added in 0003

  metadata              JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_email             ON risitex_org.companies (email);
CREATE INDEX idx_companies_gstin             ON risitex_org.companies (gstin) WHERE gstin IS NOT NULL;
CREATE INDEX idx_companies_approval_status   ON risitex_org.companies (approval_status);

COMMENT ON TABLE  risitex_org.companies IS 'B2B customer companies. Distinct from Medusa customers (individuals).';
COMMENT ON COLUMN risitex_org.companies.gstin IS 'India GST registration number. 15 chars when valid.';
COMMENT ON COLUMN risitex_org.companies.pan IS 'India Permanent Account Number. 10 chars when valid.';

CREATE TABLE risitex_org.company_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES risitex_org.companies(id) ON DELETE CASCADE,
  customer_id  TEXT        NOT NULL,    -- references Medusa customer (soft ref)
  role         TEXT        NOT NULL CHECK (role IN ('owner', 'buyer', 'viewer')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, customer_id)
);

CREATE INDEX idx_company_members_customer ON risitex_org.company_members (customer_id);

COMMENT ON TABLE risitex_org.company_members IS 'Links Medusa customers to RISITEX companies with a B2B role.';

COMMIT;
