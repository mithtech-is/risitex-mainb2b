import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Preflight check: scan the DB for stale Risitex tables that should
 * no longer exist after the Risitex → RISITEX transformation.
 *
 * Use this BEFORE running `medusa db:migrate` on any DB that may
 * have come from a Risitex dump, OR after a fresh migrate to
 * confirm that `cashfree_wallet`'s legacy KYC tables (which its
 * migrations recreate today) have been swept by
 * `migrations/2026-06-15_polemarch-purge.sql`.
 *
 * Behavior:
 *   - exits 0  → DB is clean; no equity-era residue remains.
 *   - exits 1  → at least one stale table found; the log prints the
 *                table name(s) and the recommended remediation.
 *
 * Run with:
 *   pnpm exec medusa exec ./src/scripts/preflight-purge-check.ts
 */
export default async function preflightPurgeCheck({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pgConn = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
    raw: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ table_name: string }> }>
  }

  // Stale tables to scan for. Mirrors the DROPs in
  // migrations/2026-06-15_polemarch-purge.sql.
  const STALE_PATTERNS: string[] = [
    "calcula_company_record",
    "customer_client_id",
    "identity_registry",
    "share_transfer_status",
    "watchlist",
    "watchlist_item",
    "price_alert",
    "ovo_setting",
    "aadhaar_record",
    "pan_record",
    "cmr_record",
    "demat_account",
    "bank_record",
    "bank_account",
    "secure_id_verification",
    "manual_kyc_request",
    "deposit_proof",
    "content_page",
    "content_category",
    "content_author",
    "content_comparison",
    "content_valuation_page",
    "content_tool_page",
    "content_page_template",
    "content_generated_page",
    "content_page_revision",
    "content_internal_link_suggestion",
    "content_ai_budget",
  ]

  let stale: Array<{ table: string; rows: number }> = []
  try {
    // PG_CONNECTION is a Knex instance — `?` for positional bindings,
    // not `$1`. Wrapping the array in an extra `[…]` so Knex passes
    // it as a single ARRAY binding (Knex expands the outer one).
    const result = await pgConn.raw(
      `SELECT t.table_name,
              COALESCE((
                SELECT n_live_tup FROM pg_stat_user_tables
                WHERE relname = t.table_name
              ), 0) AS rows
       FROM information_schema.tables t
       WHERE t.table_schema='public'
         AND t.table_name = ANY(?)`,
      [STALE_PATTERNS],
    )
    stale = (result.rows as Array<{ table_name: string; rows: number | string }>).map((r) => ({
      table: r.table_name,
      rows: Number(r.rows),
    }))
  } catch (err) {
    logger.error(
      `[preflight-purge] DB scan failed: ${err instanceof Error ? err.message : err}`,
    )
    process.exit(2)
  }

  if (stale.length === 0) {
    logger.info("[preflight-purge] OK — no Risitex-era residue found.")
    return
  }

  logger.warn(`[preflight-purge] Found ${stale.length} stale Risitex table(s):`)
  for (const s of stale) {
    logger.warn(`  - ${s.table}  (~${s.rows} rows)`)
  }
  logger.warn("")
  logger.warn("[preflight-purge] Remediation:")
  logger.warn(
    "  psql $DATABASE_URL -f migrations/2026-06-15_polemarch-purge.sql",
  )
  logger.warn(
    "[preflight-purge] (Note: cashfree_wallet's migrations currently RECREATE",
  )
  logger.warn(
    "  aadhaar/pan/cmr/demat/bank_record/manual_kyc/secure_id/deposit_proof",
  )
  logger.warn(
    "  on every fresh migrate. Phase 5 will excise those models so the",
  )
  logger.warn(
    "  purge isn't a permanent fixture.)",
  )
  process.exit(1)
}
