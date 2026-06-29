-- 2026-06-18 — deletion archive ("extract the old details").
--
-- Requirement (Manoj): when a customer / company / product — or any data —
-- is deleted in the backend, the OLD details must not be lost; they should be
-- archived so they can be extracted later, and the storefront should reflect
-- the deletion automatically (handled separately by the revalidate subscriber).
--
-- This file adds:
--   1. deletion_archive — one row per deleted record holding a full JSON
--      snapshot of the old details, the entity type/id, a human label, who
--      deleted it and why, and the source (db trigger vs app route).
--   2. fn_archive_deleted_row() — an EXCEPTION-SAFE trigger function that
--      snapshots OLD into deletion_archive. Wrapped in a BEGIN/EXCEPTION block
--      so a failure to archive can NEVER block or roll back the delete itself.
--   3. Triggers that archive on BOTH delete shapes, caller-agnostic:
--        • AFTER DELETE on customer/company/product — hard deletes (true row
--          removal by admin, API, or manual SQL).
--        • AFTER UPDATE OF deleted_at on customer/product — Medusa's soft-delete
--          (it sets deleted_at instead of removing the row). Company is NOT
--          given a soft-delete trigger because its DELETE route archives
--          explicitly (source='app'); a trigger would double up.
--      The function dedupes on (entity_type, entity_id) so a record that is
--      soft-deleted and later hard-purged — or already archived by a route —
--      is never written twice.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS deletion_archive (
  id          text PRIMARY KEY DEFAULT 'darch_' || replace(gen_random_uuid()::text, '-', ''),
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  label       text,
  snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_by  text,
  reason      text,
  source      text NOT NULL DEFAULT 'trigger',   -- 'trigger' | 'app'
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_archive_entity
  ON deletion_archive (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_deletion_archive_created
  ON deletion_archive (created_at DESC);

CREATE OR REPLACE FUNCTION fn_archive_deleted_row() RETURNS trigger AS $$
DECLARE
  v_snapshot jsonb;
  v_label    text;
  v_id       text;
BEGIN
  BEGIN
    v_snapshot := to_jsonb(OLD);
    v_id := v_snapshot->>'id';
    -- Dedup: at most one archive row per (entity_type, entity_id).
    IF EXISTS (
      SELECT 1 FROM deletion_archive
       WHERE entity_type = TG_TABLE_NAME AND entity_id = v_id
    ) THEN
      RETURN NULL;
    END IF;
    -- Best-effort human label from whichever common column the table has.
    v_label := COALESCE(
      v_snapshot->>'trade_name',
      v_snapshot->>'email',
      v_snapshot->>'title',
      v_snapshot->>'name',
      NULLIF(trim(both ' ' from
        COALESCE(v_snapshot->>'first_name','') || ' ' ||
        COALESCE(v_snapshot->>'last_name','')), ''),
      v_id
    );
    INSERT INTO deletion_archive
      (entity_type, entity_id, label, snapshot, source)
    VALUES
      (TG_TABLE_NAME, v_id, v_label, v_snapshot, 'trigger');
  EXCEPTION WHEN OTHERS THEN
    -- Archiving is a safety net, never a gate: swallow any error so the
    -- delete proceeds regardless.
    NULL;
  END;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Hard deletes (row physically removed) — all three entities.
DROP TRIGGER IF EXISTS trg_archive_del ON customer;
CREATE TRIGGER trg_archive_del
  AFTER DELETE ON customer
  FOR EACH ROW EXECUTE FUNCTION fn_archive_deleted_row();

DROP TRIGGER IF EXISTS trg_archive_del ON company;
CREATE TRIGGER trg_archive_del
  AFTER DELETE ON company
  FOR EACH ROW EXECUTE FUNCTION fn_archive_deleted_row();

DROP TRIGGER IF EXISTS trg_archive_del ON product;
CREATE TRIGGER trg_archive_del
  AFTER DELETE ON product
  FOR EACH ROW EXECUTE FUNCTION fn_archive_deleted_row();

-- Soft deletes (Medusa sets deleted_at) — customer + product. NOT company
-- (its DELETE route archives explicitly; a trigger would double up, and the
-- dedup would only mask that).
DROP TRIGGER IF EXISTS trg_archive_softdel ON customer;
CREATE TRIGGER trg_archive_softdel
  AFTER UPDATE OF deleted_at ON customer
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION fn_archive_deleted_row();

DROP TRIGGER IF EXISTS trg_archive_softdel ON product;
CREATE TRIGGER trg_archive_softdel
  AFTER UPDATE OF deleted_at ON product
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION fn_archive_deleted_row();
