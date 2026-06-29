-- 2026-05-03 — customer-data integrity guard rails.
--
-- Background: Manoj's customer.phone got NULL'd in prod despite
-- metadata.phone_verified=true. Root cause: account-page UI removed the
-- editable phone input but onSaveProfile still POST'd `phone: e164`
-- from a stale local state that was hydrated from the wrong source
-- (metadata.phone instead of user.phone). Empty state → empty payload
-- → null clobber on the canonical column.
--
-- This is a financial app — silent PII loss is unacceptable. Three
-- defensive layers added here, all at the DB level so they catch
-- ANY caller (backend route, admin, future code, manual SQL):
--
--   1. customer_audit_log — every UPDATE writes a row per changed
--      field with old + new value + timestamp. Forensics backstop.
--   2. customer_phone_integrity — BEFORE UPDATE trigger that REJECTS
--      a NULL'd phone when phone_verified=true (prevents the exact
--      failure we just had). Operators can override per-session via
--      `SET app.allow_phone_clobber = 'true'` for legitimate cases
--      (DPDP scrubs, support deletions).
--   3. customer_email_integrity — same shape for email (less common
--      to lose but same blast radius if it happens).
--
-- The triggers raise EXCEPTION on violation — Medusa's customer-update
-- workflow will surface this as a 500 to the client, which is the
-- right behaviour: surface the bug instead of silently corrupting
-- the row.
--
-- Idempotent: re-running this script DROPs and re-CREATEs the trigger
-- functions and re-attaches them.

BEGIN;

-- ─── 1. Audit log table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_audit_log (
    id          BIGSERIAL PRIMARY KEY,
    customer_id TEXT NOT NULL,
    field       TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Postgres usename — useful when the change came via psql/admin.
    db_user     TEXT NOT NULL DEFAULT current_user,
    -- Optional app-level context. Routes can stash a hint via
    -- `SET LOCAL app.audit_context = '<route-name>'` so the audit
    -- row tells you who wrote it.
    app_context TEXT
);

CREATE INDEX IF NOT EXISTS customer_audit_log_customer_id_idx
    ON customer_audit_log (customer_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS customer_audit_log_field_idx
    ON customer_audit_log (field, changed_at DESC);

-- ─── 2. Audit trigger function ────────────────────────────────
-- SECURITY DEFINER so the function inserts with the rights of its
-- owner (postgres), not the caller. The `customer` table is owned
-- by `medusa_app`, but `customer_audit_log` is owned by postgres —
-- without SECURITY DEFINER the trigger fails with "permission denied
-- for table customer_audit_log" whenever Medusa updates a customer.
CREATE OR REPLACE FUNCTION customer_audit_trigger()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    ctx TEXT;
BEGIN
    -- Pull the per-transaction app-context hint, if any.
    BEGIN
        ctx := current_setting('app.audit_context', true);
    EXCEPTION WHEN OTHERS THEN
        ctx := NULL;
    END;

    IF (TG_OP = 'UPDATE') THEN
        IF (OLD.email IS DISTINCT FROM NEW.email) THEN
            INSERT INTO customer_audit_log (customer_id, field, old_value, new_value, app_context)
            VALUES (NEW.id, 'email', OLD.email, NEW.email, ctx);
        END IF;
        IF (OLD.phone IS DISTINCT FROM NEW.phone) THEN
            INSERT INTO customer_audit_log (customer_id, field, old_value, new_value, app_context)
            VALUES (NEW.id, 'phone', OLD.phone, NEW.phone, ctx);
        END IF;
        IF (OLD.first_name IS DISTINCT FROM NEW.first_name) THEN
            INSERT INTO customer_audit_log (customer_id, field, old_value, new_value, app_context)
            VALUES (NEW.id, 'first_name', OLD.first_name, NEW.first_name, ctx);
        END IF;
        IF (OLD.last_name IS DISTINCT FROM NEW.last_name) THEN
            INSERT INTO customer_audit_log (customer_id, field, old_value, new_value, app_context)
            VALUES (NEW.id, 'last_name', OLD.last_name, NEW.last_name, ctx);
        END IF;
        -- Metadata changes: log only if the JSON differs. Don't store
        -- full bodies — just flag that meta changed (audit log isn't a
        -- diff store; for a full diff use the Postgres WAL or pg_audit).
        IF (OLD.metadata IS DISTINCT FROM NEW.metadata) THEN
            INSERT INTO customer_audit_log (customer_id, field, old_value, new_value, app_context)
            VALUES (NEW.id, 'metadata',
                    'len=' || coalesce(length(OLD.metadata::text), 0)::text,
                    'len=' || coalesce(length(NEW.metadata::text), 0)::text,
                    ctx);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 3. Integrity guard trigger function ──────────────────────
-- Refuses to write NULL/empty phone when phone_verified=true,
-- unless the session has explicitly opted out (DPDP scrubs do this).
CREATE OR REPLACE FUNCTION customer_phone_integrity_trigger()
RETURNS TRIGGER AS $$
DECLARE
    allow_clobber TEXT;
BEGIN
    BEGIN
        allow_clobber := current_setting('app.allow_phone_clobber', true);
    EXCEPTION WHEN OTHERS THEN
        allow_clobber := NULL;
    END;

    IF (allow_clobber = 'true') THEN
        RETURN NEW;  -- Operator opted in to a destructive update.
    END IF;

    -- Block: we had a phone before, the update is removing it, and
    -- the customer claims to have verified it. Almost always a bug.
    IF (OLD.phone IS NOT NULL AND OLD.phone <> ''
        AND (NEW.phone IS NULL OR NEW.phone = '')
        AND OLD.metadata->>'phone_verified' = 'true')
    THEN
        RAISE EXCEPTION
            'customer_phone_integrity: refusing to NULL the phone of a verified customer (id=%). Set "app.allow_phone_clobber=true" within the transaction if intentional.',
            OLD.id
            USING HINT = 'This usually indicates an upstream bug — onSaveProfile or similar sending an empty phone. Check the storefront submit path.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 4. Email integrity (lighter — email NULL is always wrong) ─
CREATE OR REPLACE FUNCTION customer_email_integrity_trigger()
RETURNS TRIGGER AS $$
DECLARE
    allow_clobber TEXT;
BEGIN
    BEGIN
        allow_clobber := current_setting('app.allow_email_clobber', true);
    EXCEPTION WHEN OTHERS THEN
        allow_clobber := NULL;
    END;

    IF (allow_clobber = 'true') THEN
        RETURN NEW;
    END IF;

    IF (OLD.email IS NOT NULL AND OLD.email <> ''
        AND (NEW.email IS NULL OR NEW.email = ''))
    THEN
        RAISE EXCEPTION
            'customer_email_integrity: refusing to NULL the email of customer (id=%). Set "app.allow_email_clobber=true" within the transaction if intentional.',
            OLD.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 5. Attach triggers (drop-and-recreate so re-run is idempotent) ─
DROP TRIGGER IF EXISTS customer_audit_trigger ON customer;
CREATE TRIGGER customer_audit_trigger
    AFTER UPDATE ON customer
    FOR EACH ROW
    EXECUTE FUNCTION customer_audit_trigger();

DROP TRIGGER IF EXISTS customer_phone_integrity_trigger ON customer;
CREATE TRIGGER customer_phone_integrity_trigger
    BEFORE UPDATE ON customer
    FOR EACH ROW
    EXECUTE FUNCTION customer_phone_integrity_trigger();

DROP TRIGGER IF EXISTS customer_email_integrity_trigger ON customer;
CREATE TRIGGER customer_email_integrity_trigger
    BEFORE UPDATE ON customer
    FOR EACH ROW
    EXECUTE FUNCTION customer_email_integrity_trigger();

-- ─── 6. Belt-and-braces: grant the app user direct privileges too ─
-- SECURITY DEFINER (above) is what actually makes this work, but
-- granting INSERT explicitly keeps things sane if the trigger is
-- ever rewritten without SECURITY DEFINER, and lets ad-hoc admin
-- queries from the app role read the audit log.
DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medusa_app') THEN
        EXECUTE 'GRANT SELECT, INSERT ON customer_audit_log TO medusa_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE customer_audit_log_id_seq TO medusa_app';
    END IF;
END
$grant$;

COMMIT;

-- Quick verify (uncomment to run interactively):
-- \d+ customer
-- SELECT count(*) FROM customer_audit_log;
