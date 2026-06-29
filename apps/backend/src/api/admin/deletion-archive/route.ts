import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /admin/deletion-archive
 *
 * Lists archived deleted records ("the old details") most-recent first. Backs
 * the admin Archive page so an operator can review or extract what was deleted.
 *
 * Query:
 *   entity_type?  — filter to 'company' | 'customer' | 'product' | …
 *   q?            — case-insensitive match on label / entity_id
 *   limit?        — default 100, max 500
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const pgConn = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION,
  ) as {
    raw: (
      sql: string,
      bindings?: unknown[],
    ) => Promise<{ rows?: Array<Record<string, unknown>> }>
  }

  const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500)
  const entityType =
    typeof req.query.entity_type === "string" && req.query.entity_type
      ? req.query.entity_type
      : null
  const q =
    typeof req.query.q === "string" && req.query.q.trim()
      ? req.query.q.trim()
      : null

  const clauses: string[] = []
  const params: unknown[] = []
  if (entityType) {
    clauses.push("entity_type = ?")
    params.push(entityType)
  }
  if (q) {
    clauses.push("(label ILIKE ? OR entity_id ILIKE ?)")
    params.push(`%${q}%`, `%${q}%`)
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
  params.push(limit)

  try {
    const r = await pgConn.raw(
      `SELECT id, entity_type, entity_id, label, snapshot, deleted_by,
              reason, source, created_at
         FROM deletion_archive
         ${where}
        ORDER BY created_at DESC
        LIMIT ?`,
      params,
    )
    return res.json({ archives: r.rows ?? [], count: (r.rows ?? []).length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return res.status(500).json({ message: msg })
  }
}
