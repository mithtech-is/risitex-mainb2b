import { AbstractFileProviderService, MedusaError } from "@medusajs/framework/utils"
import type {
  ProviderUploadFileDTO,
  ProviderFileResultDTO,
  ProviderDeleteFileDTO,
  ProviderGetFileDTO,
} from "@medusajs/framework/types"
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Pool } from "pg"
import { createReadStream } from "fs"
import fsp from "fs/promises"
import path from "path"
import { Readable } from "stream"
import { decryptString } from "../cashfree_wallet/cashfree/crypto"

/**
 * Configurable File Module provider for PUBLIC assets.
 *
 * Unlike the stock providers (configured once at boot), this one reads
 * its active backend from the `file_storage_setting` DB row on every
 * operation (10s cache), so an admin can switch between local disk and
 * any S3-compatible store — Cloudflare R2 / AWS S3 / MinIO / Wasabi /
 * DigitalOcean Spaces — from backrow23 → File storage, no redeploy.
 *
 * Resolution order:
 *   1. DB row (provider = "s3" with bucket + keys) → S3-compatible
 *   2. DB row (provider = "local") OR no usable config → local static/
 *   3. As a seed/fallback before anything is saved, env S3_* vars are
 *      honoured (continuity with the env-based setup).
 *
 * Reads the DB directly via its own pg Pool (DATABASE_URL) — a File
 * Module provider can't resolve the app container's services. The secret
 * access key column is AES-256-GCM ciphertext, decrypted here.
 *
 * KYC / proof uploads do NOT use this provider — they write to the
 * private static volume through the polemarch module and never reach an
 * object store.
 */

type ResolvedConfig =
  | { mode: "local" }
  | {
      mode: "s3"
      bucket: string
      endpoint?: string
      region: string
      fileUrl: string
      prefix: string
      forcePathStyle: boolean
      cacheControl: string
      accessKeyId: string
      secretAccessKey: string
    }

const CONFIG_TTL_MS = 10_000

class ConfigurableFileProviderService extends AbstractFileProviderService {
  static identifier = "configurable"

  private pool_: Pool | null = null
  private configCache_: { at: number; value: ResolvedConfig } | null = null
  private s3Cache_: { key: string; client: S3Client } | null = null
  private backendUrl_: string

  constructor() {
    super()
    // Local fallback URL base (matches the express.static /static mount).
    const host = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
    this.backendUrl_ = `${host.replace(/\/$/, "")}/static`
  }

  private pool(): Pool {
    if (!this.pool_) {
      this.pool_ = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 2,
      })
    }
    return this.pool_
  }

  /** Load + cache the active config. Never throws — falls back to local. */
  private async config(): Promise<ResolvedConfig> {
    const now = Date.now()
    if (this.configCache_ && now - this.configCache_.at < CONFIG_TTL_MS) {
      return this.configCache_.value
    }
    let resolved: ResolvedConfig = { mode: "local" }
    try {
      const { rows } = await this.pool().query(
        `SELECT provider, s3_bucket, s3_endpoint, s3_region, s3_file_url,
                s3_prefix, s3_force_path_style, s3_cache_control,
                s3_access_key_id, s3_secret_access_key_encrypted
           FROM file_storage_setting
          WHERE singleton_key IN ('public', 'default') AND deleted_at IS NULL
          ORDER BY (singleton_key = 'public') DESC
          LIMIT 1`,
      )
      const row = rows?.[0]
      if (row && row.provider === "s3" && row.s3_bucket && row.s3_access_key_id && row.s3_secret_access_key_encrypted) {
        resolved = {
          mode: "s3",
          bucket: row.s3_bucket,
          endpoint: row.s3_endpoint || undefined,
          region: row.s3_region || "auto",
          fileUrl: (row.s3_file_url || "").replace(/\/$/, ""),
          prefix: row.s3_prefix || "",
          forcePathStyle: !!row.s3_force_path_style,
          cacheControl: row.s3_cache_control || "public, max-age=31536000, immutable",
          accessKeyId: row.s3_access_key_id,
          secretAccessKey: decryptString(row.s3_secret_access_key_encrypted),
        }
      } else if (!row && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
        // Seed/fallback from env when nothing has been saved yet.
        resolved = {
          mode: "s3",
          bucket: process.env.S3_BUCKET,
          endpoint: process.env.S3_ENDPOINT || undefined,
          region: process.env.S3_REGION || "auto",
          fileUrl: (process.env.S3_FILE_URL || "").replace(/\/$/, ""),
          prefix: process.env.S3_PREFIX || "",
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
          cacheControl: process.env.S3_CACHE_CONTROL || "public, max-age=31536000, immutable",
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      }
    } catch {
      resolved = { mode: "local" }
    }
    this.configCache_ = { at: now, value: resolved }
    return resolved
  }

  /** Build/cache an S3 client for the given S3 config. */
  private s3(cfg: Extract<ResolvedConfig, { mode: "s3" }>): S3Client {
    const key = `${cfg.endpoint}|${cfg.region}|${cfg.accessKeyId}|${cfg.forcePathStyle}`
    if (this.s3Cache_ && this.s3Cache_.key === key) return this.s3Cache_.client
    const client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    })
    this.s3Cache_ = { key, client }
    return client
  }

  private buildKey(filename: string, access?: string, prefix = ""): string {
    const parsed = path.parse(filename)
    const safeBase = parsed.base.replace(/[^a-zA-Z0-9._-]/g, "_")
    const visibility = access === "public" ? "" : "private-"
    return `${prefix}${visibility}${Date.now()}-${safeBase}`
  }

  private decodeContent(content: string): Buffer {
    try {
      const decoded = Buffer.from(content, "base64")
      if (decoded.toString("base64") === content) return decoded
      return Buffer.from(content, "utf8")
    } catch {
      return Buffer.from(content, "binary")
    }
  }

  // ── local helpers ──────────────────────────────────────────────────
  private localDir(): string {
    return path.join(process.cwd(), "static")
  }
  private localPath(fileKey: string): string {
    return path.join(this.localDir(), path.basename(fileKey))
  }
  private localUrl(fileKey: string): string {
    const u = new URL(this.backendUrl_)
    u.pathname = path.join(u.pathname, path.basename(fileKey))
    return u.href
  }

  // ── AbstractFileProviderService ────────────────────────────────────
  async upload(file: ProviderUploadFileDTO): Promise<ProviderFileResultDTO> {
    if (!file?.filename) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "No filename provided")
    }
    const cfg = await this.config()
    const content = this.decodeContent(file.content)

    if (cfg.mode === "s3") {
      const key = this.buildKey(file.filename, file.access, cfg.prefix)
      await this.s3(cfg).send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: content,
          ContentType: file.mimeType,
          CacheControl: cfg.cacheControl,
        }),
      )
      const base = cfg.fileUrl || `${cfg.endpoint}/${cfg.bucket}`
      return { key, url: `${base}/${key}` }
    }

    // local
    const key = this.buildKey(file.filename, file.access)
    await fsp.mkdir(this.localDir(), { recursive: true })
    await fsp.writeFile(this.localPath(key), content)
    return { key, url: this.localUrl(key) }
  }

  async delete(
    fileData: ProviderDeleteFileDTO | ProviderDeleteFileDTO[],
  ): Promise<void> {
    const files = Array.isArray(fileData) ? fileData : [fileData]
    const cfg = await this.config()
    await Promise.all(
      files.map(async (f) => {
        if (!f?.fileKey) return
        if (cfg.mode === "s3") {
          await this.s3(cfg)
            .send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: f.fileKey }))
            .catch(() => {})
        } else {
          await fsp.unlink(this.localPath(f.fileKey)).catch((e: any) => {
            if (e?.code !== "ENOENT") throw e
          })
        }
      }),
    )
  }

  async getPresignedDownloadUrl(fileData: ProviderGetFileDTO): Promise<string> {
    const cfg = await this.config()
    if (cfg.mode === "s3") {
      // Public assets are reachable at the public base URL directly; still
      // return a presigned URL so private objects work too.
      return getSignedUrl(
        this.s3(cfg),
        new GetObjectCommand({ Bucket: cfg.bucket, Key: fileData.fileKey }),
        { expiresIn: 3600 },
      )
    }
    return this.localUrl(fileData.fileKey)
  }

  async getDownloadStream(fileData: ProviderGetFileDTO): Promise<Readable> {
    const cfg = await this.config()
    if (cfg.mode === "s3") {
      const res = await this.s3(cfg).send(
        new GetObjectCommand({ Bucket: cfg.bucket, Key: fileData.fileKey }),
      )
      return res.Body as Readable
    }
    return createReadStream(this.localPath(fileData.fileKey))
  }

  async getAsBuffer(fileData: ProviderGetFileDTO): Promise<Buffer> {
    const cfg = await this.config()
    if (cfg.mode === "s3") {
      const res = await this.s3(cfg).send(
        new GetObjectCommand({ Bucket: cfg.bucket, Key: fileData.fileKey }),
      )
      const chunks: Buffer[] = []
      for await (const chunk of res.Body as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      return Buffer.concat(chunks)
    }
    return fsp.readFile(this.localPath(fileData.fileKey))
  }
}

export default ConfigurableFileProviderService
