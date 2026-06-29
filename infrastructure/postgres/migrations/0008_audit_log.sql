-- 0008: append-only audit log
--
-- Generic audit trail. Every meaningful state change writes one row.
-- Application code MUST NOT UPDATE or DELETE rows here.

BEGIN;

CREATE TABLE risitex_audit.audit_log (
  id                    BIGSERIAL    PRIMARY KEY,
  occurred_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  actor_type            TEXT         NOT NULL CHECK (actor_type IN (
    'user', 'customer', 'sales_rep', 'system', 'api_key', 'webhook'
  )),
  actor_id              TEXT,
  actor_email           CITEXT,

  -- Impersonation: actor is operating on behalf of someone else
  on_behalf_of_type     TEXT         CHECK (on_behalf_of_type IN ('customer', 'company') OR on_behalf_of_type IS NULL),
  on_behalf_of_id       TEXT,

  action                TEXT         NOT NULL,
  entity_type           TEXT,
  entity_id             TEXT,
  before_state          JSONB,
  after_state           JSONB,
  context               JSONB
);

CREATE INDEX idx_audit_actor   ON risitex_audit.audit_log (actor_type, actor_id, occurred_at DESC);
CREATE INDEX idx_audit_entity  ON risitex_audit.audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_audit_action  ON risitex_audit.audit_log (action, occurred_at DESC);
CREATE INDEX idx_audit_at      ON risitex_audit.audit_log (occurred_at);

COMMENT ON TABLE risitex_audit.audit_log IS 'Append-only audit trail. Never UPDATE or DELETE rows. Range-partition by occurred_at (monthly) in Phase 10 once volume justifies it.';
COMMENT ON COLUMN risitex_audit.audit_log.action IS 'Dot-notation action key. Examples: company.approved, order.created, wallet.adjusted, sales_rep.impersonation_started.';

COMMIT;
