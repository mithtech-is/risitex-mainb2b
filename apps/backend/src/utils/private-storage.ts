/**
 * Private-uploads storage helper (KYC docs, bank/deposit proofs, CMRs).
 *
 * These files are governed by the `private` scope of `file_storage_setting`
 * (backrow23 → File storage → "Private uploads" card). Default backend is
 * the local `static/` volume; an operator can point it at any S3-compatible
 * store (MinIO / S3 / etc.) without a redeploy.
 *
 * Unlike public assets, private files are NEVER exposed on a public URL —
 * the canonical reference stays `/static/<name>` and the bytes are served
 * back through the authenticated/guarded `/static` route, which reads here.
 *
 * This module reads the config straight from the DB via its own pg Pool
 * (10s cache) so it works from any context — module services, route
 * middlewares, and plain utils alike — without needing the app container.
 * The secret access key column is AES-256-GCM ciphertext, decrypted here.
 */
import { Pool } from "pg"
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import { Readable } from "stream"
import { decryptString } from "../modules/cashfree_wallet/cashfree/crypto"

const STATIC_DIR = path.join(process.cwd(), "static")
const TTL_MS = 10_000

type PrivateConfig =
  | { mode: "local" }
  | {
      mode: "s3"
      bucket: string
      endpoint?: string
      region: string
      prefix: string
      forcePathStyle: boolean
      cacheControl: string
      accessKeyId: string
      secretAccessKey: string
    }

let pool_: Pool | null = null
let cache_: { at: number; value: PrivateConfig } | null = null
let s3Cache_: { key: string; client: S3Client } | null = null

function pool(): Pool {
  if (!pool_) {
    pool_ = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  }
  return pool_
}

/** Read + cache the active PRIVATE backend config. Never throws → local. */
async function config(): Promise<PrivateConfig> {
  const now = Date.now()
  if (cache_ && now - cache_.at < TTL_MS) return cache_.value
  let resolved: PrivateConfig = { mode: "local" }
  try {
    const { rows } = await pool().query(
      `SELECT provider, s3_bucket, s3_endpoint, s3_region, s3_prefix,
              s3_force_path_style, s3_cache_control, s3_access_key_id,
              s3_secret_access_key_encrypted
         FROM file_storage_setting
        WHERE singleton_key = 'private' AND deleted_at IS NULL
        LIMIT 1`,
    )
    const row = rows?.[0]
    if (
      row &&
      row.provider === "s3" &&
      row.s3_bucket &&
      row.s3_access_key_id &&
      row.s3_secret_access_key_encrypted
    ) {
      resolved = {
        mode: "s3",
        bucket: row.s3_bucket,
        endpoint: row.s3_endpoint || undefined,
        region: row.s3_region || "auto",
        prefix: row.s3_prefix || "",
        forcePathStyle: !!row.s3_force_path_style,
        cacheControl: row.s3_cache_control || "private, max-age=0, no-store",
        accessKeyId: row.s3_access_key_id,
        secretAccessKey: decryptString(row.s3_secret_access_key_encrypted),
      }
    }
  } catch {
    resolved = { mode: "local" }
  }
  cache_ = { at: now, value: resolved }
  return resolved
}

function s3(cfg: Extract<PrivateConfig, { mode: "s3" }>): S3Client {
  const key = `${cfg.endpoint}|${cfg.region}|${cfg.accessKeyId}|${cfg.forcePathStyle}`
  if (s3Cache_ && s3Cache_.key === key) return s3Cache_.client
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })
  s3Cache_ = { key, client }
  return client
}

/** Safe `/static/<name>` → `<name>` with path-traversal defense. */
export function privateBasename(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null
  const idx = url.indexOf("/static/")
  const raw = idx === -1 ? url : url.slice(idx + "/static/".length)
  const name = path.basename(raw)
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return null
  }
  return name
}

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
}
function mimeFor(name: string): string {
  return MIME[path.extname(name).toLowerCase()] || "application/octet-stream"
}

/** Write a private file. Returns the stable `/static/<name>` URL. */
export async function writePrivateFile(
  buffer: Buffer,
  fileName: string,
): Promise<{ url: string; fileName: string }> {
  const cfg = await config()
  if (cfg.mode === "s3") {
    await s3(cfg).send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: `${cfg.prefix}${fileName}`,
        Body: buffer,
        ContentType: mimeFor(fileName),
        CacheControl: cfg.cacheControl,
      }),
    )
    return { url: `/static/${fileName}`, fileName }
  }
  if (!fs.existsSync(STATIC_DIR)) fs.mkdirSync(STATIC_DIR, { recursive: true })
  fs.writeFileSync(path.join(STATIC_DIR, fileName), buffer)
  return { url: `/static/${fileName}`, fileName }
}

/** Read a private file back as a Buffer. Tries local disk first (covers
 *  files written before a backend switch + local mode), then the private
 *  S3 bucket. Returns null if not found / unreadable. */
export async function readPrivateFile(url: string): Promise<Buffer | null> {
  const name = privateBasename(url)
  if (!name) return null
  // local first
  const local = path.resolve(path.join(STATIC_DIR, name))
  if (local.startsWith(path.resolve(STATIC_DIR) + path.sep) && fs.existsSync(local)) {
    try {
      return await fsp.readFile(local)
    } catch {
      /* fall through to S3 */
    }
  }
  const cfg = await config()
  if (cfg.mode !== "s3") return null
  try {
    const out = await s3(cfg).send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: `${cfg.prefix}${name}` }),
    )
    const body = out.Body as Readable
    const chunks: Buffer[] = []
    for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
    return Buffer.concat(chunks)
  } catch {
    return null
  }
}

/** Content-type for a private file (used by the serving route). */
export function privateMime(url: string): string | null {
  const name = privateBasename(url)
  if (!name) return null
  const ext = path.extname(name).toLowerCase()
  return MIME[ext] ?? null
}

/** Delete a private file from wherever it lives (local + S3 both attempted). */
export async function deletePrivateFile(url: string): Promise<{ success: boolean }> {
  const name = privateBasename(url)
  if (!name) return { success: false }
  let ok = false
  const local = path.resolve(path.join(STATIC_DIR, name))
  if (local.startsWith(path.resolve(STATIC_DIR) + path.sep)) {
    try {
      if (fs.existsSync(local)) {
        fs.unlinkSync(local)
        ok = true
      }
    } catch {
      /* ignore */
    }
  }
  const cfg = await config()
  if (cfg.mode === "s3") {
    try {
      await s3(cfg).send(
        new DeleteObjectCommand({ Bucket: cfg.bucket, Key: `${cfg.prefix}${name}` }),
      )
      ok = true
    } catch {
      /* ignore */
    }
  }
  return { success: ok }
}
