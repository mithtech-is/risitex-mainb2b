/**
 * Deletion archive helper — "extract the old details".
 *
 * Persists a full JSON snapshot of a record into `deletion_archive` (created by
 * migrations/2026-06-18_deletion-archive.sql) just BEFORE it's removed, so the
 * old details are never lost and can be pulled back from the admin Archive view.
 *
 * Used by delete paths we control — chiefly the company DELETE route, which
 * SOFT-deletes (UPDATE deleted_at). The DB-level AFTER DELETE trigger only fires
 * on hard deletes, so soft-delete paths archive explicitly through here, tagged
 * source='app'.
 *
 * Contract: best-effort. Archiving must NEVER block or fail the delete — every
 * call swallows its own errors.
 */
type PgConn = {
  raw: (sql: string, bindings?: unknown[]) => Promise<unknown>
}

export async function archiveRecord(
  pgConn: PgConn,
  input: {
    entity_type: string
    entity_id: string
    label?: string | null
    snapshot: Record<string, unknown>
    deleted_by?: string | null
    reason?: string | null
  },
): Promise<void> {
  try {
    await pgConn.raw(
      `INSERT INTO deletion_archive
         (entity_type, entity_id, label, snapshot, deleted_by, reason, source)
       VALUES (?, ?, ?, ?::jsonb, ?, ?, 'app')`,
      [
        input.entity_type,
        input.entity_id,
        input.label ?? null,
        JSON.stringify(input.snapshot ?? {}),
        input.deleted_by ?? null,
        input.reason ?? null,
      ],
    )
  } catch {
    // Archiving is a safety net, never a gate — let the delete proceed.
  }
}
