-- 0007: ERPNext sync infrastructure
--
-- entity_mappings: RISITEX id <-> ERPNext docname (so we know what's been synced)
-- sync_jobs: durable queue of pending/in-flight sync operations
-- sync_logs: per-job log lines (debug/info/warn/error)

BEGIN;

CREATE TABLE risitex_erp.entity_mappings (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  risitex_entity           TEXT        NOT NULL,
  risitex_entity_id        TEXT        NOT NULL,
  erpnext_doctype          TEXT        NOT NULL,
  erpnext_entity_name      TEXT        NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (risitex_entity, risitex_entity_id, erpnext_doctype)
);

CREATE INDEX idx_erp_mappings_forward ON risitex_erp.entity_mappings (risitex_entity, risitex_entity_id);
CREATE INDEX idx_erp_mappings_reverse ON risitex_erp.entity_mappings (erpnext_doctype, erpnext_entity_name);

COMMENT ON TABLE risitex_erp.entity_mappings IS 'Bi-directional id mapping between RISITEX and ERPNext entities.';

CREATE TABLE risitex_erp.sync_jobs (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type            TEXT         NOT NULL,
  direction           TEXT         NOT NULL CHECK (direction IN ('to_erp', 'from_erp')),
  payload             JSONB        NOT NULL,
  status              TEXT         NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_progress', 'completed', 'failed', 'dead_letter')),
  attempt             INT          NOT NULL DEFAULT 0,
  max_attempts        INT          NOT NULL DEFAULT 5,
  scheduled_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  next_retry_at       TIMESTAMPTZ,
  last_error          TEXT,
  idempotency_key     TEXT UNIQUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_jobs_due
  ON risitex_erp.sync_jobs (scheduled_at)
  WHERE status = 'queued';

CREATE INDEX idx_sync_jobs_retry
  ON risitex_erp.sync_jobs (next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

CREATE INDEX idx_sync_jobs_type_status ON risitex_erp.sync_jobs (job_type, status);

COMMENT ON TABLE risitex_erp.sync_jobs IS 'Durable ERPNext sync queue. Workers claim by scheduled_at order.';
COMMENT ON COLUMN risitex_erp.sync_jobs.idempotency_key IS 'Per-payload key to skip duplicate enqueues. NULL allowed but discouraged.';

CREATE TABLE risitex_erp.sync_logs (
  id           BIGSERIAL PRIMARY KEY,
  job_id       UUID         REFERENCES risitex_erp.sync_jobs(id) ON DELETE SET NULL,
  level        TEXT         NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message      TEXT         NOT NULL,
  details      JSONB,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_logs_job   ON risitex_erp.sync_logs (job_id, created_at DESC);
CREATE INDEX idx_sync_logs_level ON risitex_erp.sync_logs (level, created_at DESC);

COMMENT ON TABLE risitex_erp.sync_logs IS 'Per-job log lines. Truncate / partition in Phase 10 if volume grows.';

COMMIT;
