/**
 * One-time migration: move existing PUBLIC product assets from the local
 * `static/` volume to the configured File Module backend (Cloudflare R2
 * in production).
 *
 * What it touches:
 *   - `image.url`          — product gallery images
 *   - `product.thumbnail`  — product/company thumbnail (logo)
 *
 * For each row whose URL points at local `/static/...` (or the legacy
 * `http://localhost:9000/static/...` dev form), it:
 *   1. reads the file from the local static dir,
 *   2. re-uploads it through the File Module (→ R2 when S3_* is set),
 *      with public access,
 *   3. rewrites the DB column to the new public URL.
 *
 * Idempotent: rows already pointing at the configured S3_FILE_URL (or any
 * non-/static absolute URL) are skipped, so it's safe to re-run.
 *
 * It does NOT touch any KYC / proof file — those live outside the File
 * Module on the private static volume by design and must stay local.
 *
 * Run on the server AFTER R2 credentials are in place:
 *   docker compose exec medusa-backend \
 *     npx medusa exec ./src/scripts/migrate-public-assets-to-r2.ts
 */
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import fs from "fs"
import path from "path"

const STATIC_DIR = path.join(process.cwd(), "static")

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
}

/** Pull the `/static/<filename>` basename out of any local-form URL.
 *  Returns null for URLs that are NOT local static (already migrated,
 *  external CDN, etc.) so those are left untouched. */
function localStaticBasename(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null
  const idx = url.indexOf("/static/")
  if (idx === -1) return null
  const fileName = path.basename(url.slice(idx + "/static/".length))
  // Path-traversal guard — mirrors readCmrBuffer's checks.
  if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    return null
  }
  return fileName
}

export default async function migratePublicAssetsToR2({ container }: { container: any }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const knex: any = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const fileModule: any = container.resolve(Modules.FILE)

  const fileUrlBase = process.env.S3_FILE_URL || ""
  logger.info(
    `[r2-migrate] start — File Module target: ${fileUrlBase || "(local — set S3_* to target R2)"}`,
  )

  // Cache so the same physical file (shared across rows) uploads once.
  const uploaded = new Map<string, string>()

  async function migrateOne(fileName: string): Promise<string | null> {
    if (uploaded.has(fileName)) return uploaded.get(fileName)!
    const full = path.join(STATIC_DIR, fileName)
    const resolved = path.resolve(full)
    if (!resolved.startsWith(path.resolve(STATIC_DIR) + path.sep)) return null
    if (!fs.existsSync(resolved)) {
      logger.warn(`[r2-migrate] local file missing, skipping: ${fileName}`)
      return null
    }
    const buffer = fs.readFileSync(resolved)
    const ext = path.extname(fileName).toLowerCase()
    const mimeType = MIME[ext] || "application/octet-stream"
    const [created] = await fileModule.createFiles([
      {
        filename: fileName,
        mimeType,
        content: buffer.toString("base64"),
        access: "public",
      },
    ])
    uploaded.set(fileName, created.url)
    logger.info(`[r2-migrate] uploaded ${fileName} → ${created.url}`)
    return created.url
  }

  let imagesMigrated = 0
  let thumbsMigrated = 0

  // ── Product gallery images ────────────────────────────────────────
  const images = await knex("image").select(["id", "url"]).whereNull("deleted_at")
  for (const row of images) {
    const fileName = localStaticBasename(row.url)
    if (!fileName) continue // already external / migrated
    const newUrl = await migrateOne(fileName)
    if (!newUrl) continue
    await knex("image").where({ id: row.id }).update({ url: newUrl, updated_at: new Date() })
    imagesMigrated++
  }

  // ── Product thumbnails ────────────────────────────────────────────
  const products = await knex("product")
    .select(["id", "thumbnail"])
    .whereNotNull("thumbnail")
    .whereNull("deleted_at")
  for (const row of products) {
    const fileName = localStaticBasename(row.thumbnail)
    if (!fileName) continue
    const newUrl = await migrateOne(fileName)
    if (!newUrl) continue
    await knex("product").where({ id: row.id }).update({ thumbnail: newUrl, updated_at: new Date() })
    thumbsMigrated++
  }

  logger.info(
    `[r2-migrate] done — images=${imagesMigrated}, thumbnails=${thumbsMigrated}, unique_files=${uploaded.size}`,
  )
  logger.info(
    `[r2-migrate] local originals left in place under static/ (delete manually once R2 is verified).`,
  )
}
