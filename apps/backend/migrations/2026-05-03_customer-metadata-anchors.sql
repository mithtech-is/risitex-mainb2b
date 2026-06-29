-- 2026-05-03 — extend customer-data integrity to metadata key set.
--
-- Builds on 2026-05-03_customer-data-integrity.sql. That migration
-- caught NULL-clobber on customer.phone / customer.email at the
-- column level. This one extends the same defence to the JSON metadata
-- field, where we've seen wholesale REPLACE-on-write bugs (e.g. a PAN
-- verify writing `metadata: { full_name: X }` with no spread, wiping
-- phone_verified / pan_hash / aadhaar_hash / etc.).
--
-- Two changes:
--   1. Audit log captures METADATA KEY SET (sorted, comma-joined)
--      before and after, instead of just the JSON length. Forensics
--      can now see exactly which keys disappeared.
--   2. New trigger refuses to REMOVE any of an "anchor key" allow-list
--      from metadata. These keys (phone_verified, pan_hash, etc.) tie
--      the customer record to verified PII / auth state — losing them
--      silently is the worst-class data-loss bug. Requires the same
--      `app.allow_phone_clobber = 'true'` style override
--      (`app.allow_metadata_anchor_drop = 'true'`) for legitimate
--      DPDP / admin removal.
--
-- The DB layer is the right home for this rule because the bugs we've
-- seen come from upstream code we don't always control (Medusa's
-- workflows, frontend race conditions, future routes added by other
-- agents). A TRIGGER catches all of them by construction.

BEGIN;

-- ─── 1. Replace audit trigger to capture key-set diff ──────────
CREATE OR REPLACE FUNCTION customer_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    ctx TEXT;
    old_keys TEXT;
    new_keys TEXT;
BEGIN
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
        IF (OLD.metadata IS DISTINCT FROM NEW.metadata) THEN
            -- Build sorted comma-joined key sets so a diff is obvious
            -- in the audit log. Bodies are too verbose to log inline.
            SELECT string_agg(k, ',' ORDER BY k) INTO old_keys
              FROM jsonb_object_keys(coalesce(OLD.metadata, '{}'::jsonb)) AS k;
            SELECT string_agg(k, ',' ORDER BY k) INTO new_keys
              FROM jsonb_object_keys(coalesce(NEW.metadata, '{}'::jsonb)) AS k;
            INSERT INTO customer_audit_log (customer_id, field, old_value, new_value, app_context)
            VALUES (NEW.id, 'metadata.keys', coalesce(old_keys, ''), coalesce(new_keys, ''), ctx);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 2. Anchor-key protection trigger ──────────────────────────
-- Refuses any UPDATE that drops a key in the anchor allow-list from
-- metadata. The anchor list is the set of fields that anchor the
-- customer to a verified state (PII / auth) — losing any of them
-- silently is the worst-class data-loss bug.
--
-- Override: `SET LOCAL app.allow_metadata_anchor_drop = 'true'`
-- inside the transaction. Used by DPDP scrub + the dedicated
-- /store/me/2fa/disable route (when it ships).
CREATE OR REPLACE FUNCTION customer_metadata_anchor_trigger()
RETURNS TRIGGER AS $$
DECLARE
    allow_drop TEXT;
    anchor_keys TEXT[] := ARRAY[
        'phone_verified',
        'phone_verified_at',
        'email_verified',
        'email_verified_at',
        -- RISITEX: dropped pan_hash / pan_record_id / aadhaar_hash —
        -- those anchored to SEBI KYC and have no equivalent in the
        -- textile B2B model. Identity verification for RISITEX MBOs
        -- goes through GSTIN on the company record (Phase 4).
        'totp_enabled',
        'totp_secret_encrypted',
        'totp_recovery_code_hashes',
        'webauthn_enabled'
    ];
    k TEXT;
    dropped TEXT[] := ARRAY[]::TEXT[];
BEGIN
    BEGIN
        allow_drop := current_setting('app.allow_metadata_anchor_drop', true);
    EXCEPTION WHEN OTHERS THEN
        allow_drop := NULL;
    END;

    IF (allow_drop = 'true') THEN
        RETURN NEW;
    END IF;

    -- Only check on actual JSONB change (no-op updates skip).
    IF (OLD.metadata IS NOT DISTINCT FROM NEW.metadata) THEN
        RETURN NEW;
    END IF;

    FOREACH k IN ARRAY anchor_keys LOOP
        -- "Dropped" = the key was present in OLD with a non-null value
        -- AND is missing or null in NEW.
        IF (OLD.metadata ? k AND OLD.metadata->k IS NOT NULL
            AND (NOT (NEW.metadata ? k) OR NEW.metadata->k IS NULL))
        THEN
            dropped := array_append(dropped, k);
        END IF;
    END LOOP;

    IF array_length(dropped, 1) > 0 THEN
        RAISE EXCEPTION
            'customer_metadata_anchor: refusing to drop anchor key(s) % from customer (id=%). These keys tie the record to verified PII/auth state. If intentional (DPDP scrub, 2FA disable, etc.) set "app.allow_metadata_anchor_drop=true" in the transaction.',
            dropped, OLD.id
            USING HINT = 'Likely cause: a customer.update or jsonb write that did not spread the existing metadata. Look at the calling route and audit log entry for context.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 3. Re-attach triggers ─────────────────────────────────────
DROP TRIGGER IF EXISTS customer_audit_trigger ON customer;
CREATE TRIGGER customer_audit_trigger
    AFTER UPDATE ON customer
    FOR EACH ROW
    EXECUTE FUNCTION customer_audit_trigger();

DROP TRIGGER IF EXISTS customer_metadata_anchor_trigger ON customer;
CREATE TRIGGER customer_metadata_anchor_trigger
    BEFORE UPDATE ON customer
    FOR EACH ROW
    EXECUTE FUNCTION customer_metadata_anchor_trigger();

COMMIT;
