-- 2026-06-18 — keep customer.has_account consistent with login existence.
--
-- Problem (Manoj): the admin "delete customer" fails with 404 "Auth identity
-- not found" whenever a customer is flagged has_account=true but has NO login
-- identity (provider_identity). Medusa's core customer-delete tries to remove
-- the linked auth identity only when has_account=true, and errors when it's
-- gone — so such a customer can't be deleted from the backend at all.
--
-- This inconsistent state can arise when a customer's auth gets removed out of
-- band (the earlier email-scoped purge bug, manual cleanup, etc.) while the
-- customer row lives on. has_account should always reflect reality: "does this
-- customer actually have a login?".
--
-- Fix: AFTER DELETE on provider_identity, if no login identity remains for that
-- email, clear has_account on the matching LIVE customer(s). They become a
-- plain (guest-like) record that the core delete can remove cleanly, and the
-- "Registered" badge no longer lies. Exception-safe; never blocks the delete.
--
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION fn_sync_has_account() RETURNS trigger AS $$
BEGIN
  BEGIN
    -- Only act once the email has no remaining login identity.
    IF NOT EXISTS (
      SELECT 1 FROM provider_identity WHERE entity_id = OLD.entity_id
    ) THEN
      UPDATE customer
         SET has_account = false,
             updated_at = now()
       WHERE email = OLD.entity_id
         AND has_account = true
         AND deleted_at IS NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_has_account ON provider_identity;
CREATE TRIGGER trg_sync_has_account
  AFTER DELETE ON provider_identity
  FOR EACH ROW EXECUTE FUNCTION fn_sync_has_account();

-- One-time reconcile of any customers already stuck in the bad state
-- (has_account=true but no login identity) so they're deletable now.
UPDATE customer cu
   SET has_account = false, updated_at = now()
 WHERE cu.has_account = true
   AND cu.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM provider_identity pi WHERE pi.entity_id = cu.email
   );
