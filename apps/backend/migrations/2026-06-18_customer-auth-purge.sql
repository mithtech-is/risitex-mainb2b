-- 2026-06-18 — purge a customer's login identity when the customer is deleted.
--
-- Problem (Manoj): deleting a customer in the backend left the auth rows
-- (auth_identity + provider_identity) behind, so the storefront still reported
-- "identity already exists" on re-register / sign-in. Medusa soft-deletes the
-- `customer` row but does NOT cascade to the auth module.
--
-- Fix: a trigger that, on customer soft-delete (UPDATE deleted_at) OR hard
-- delete, removes the matching auth identity so the email is fully freed.
--   - provider_identity by entity_id = email (the emailpass login), and by the
--     auth_identity link.
--   - auth_identity by app_metadata.customer_id = the deleted customer id.
-- Exception-safe: a failure here must never block the customer delete.
--
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION fn_purge_customer_auth() RETURNS trigger AS $$
BEGIN
  BEGIN
    -- 1. Drop the auth tied SPECIFICALLY to this customer via the
    --    app_metadata link. This never touches another customer's login.
    DELETE FROM provider_identity
     WHERE auth_identity_id IN (
       SELECT id FROM auth_identity WHERE app_metadata->>'customer_id' = OLD.id
     );
    DELETE FROM auth_identity
     WHERE app_metadata->>'customer_id' = OLD.id;

    -- 2. Also drop the emailpass login for this email — but ONLY when no
    --    OTHER LIVE customer still uses it. This frees the email after the
    --    last customer is deleted (covers identities whose customer_id link
    --    was never set) WITHOUT clobbering a fresh re-registration that
    --    happens to share the same email (the bug this guard fixes).
    DELETE FROM provider_identity pi
     WHERE pi.entity_id = OLD.email
       AND NOT EXISTS (
         SELECT 1 FROM customer c2
          WHERE c2.email = OLD.email
            AND c2.deleted_at IS NULL
            AND c2.id <> OLD.id
       );
  EXCEPTION WHEN OTHERS THEN
    -- Never block the customer delete because auth cleanup failed.
    NULL;
  END;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Medusa soft-delete (sets deleted_at).
DROP TRIGGER IF EXISTS trg_purge_auth_softdel ON customer;
CREATE TRIGGER trg_purge_auth_softdel
  AFTER UPDATE OF deleted_at ON customer
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION fn_purge_customer_auth();

-- Hard delete (true row removal).
DROP TRIGGER IF EXISTS trg_purge_auth_del ON customer;
CREATE TRIGGER trg_purge_auth_del
  AFTER DELETE ON customer
  FOR EACH ROW EXECUTE FUNCTION fn_purge_customer_auth();
