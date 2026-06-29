import { model } from "@medusajs/framework/utils"

/**
 * Singleton row holding the active PUBLIC file-storage configuration,
 * editable from the admin UI (backrow23 → File storage).
 *
 * The configurable file provider (src/modules/file_storage_provider)
 * reads this row at runtime to decide where product images / logos and
 * other File-Module assets are stored — local disk or any S3-compatible
 * object store (Cloudflare R2, AWS S3, MinIO, Wasabi, DigitalOcean
 * Spaces). Changing it takes effect without a redeploy.
 *
 * Sensitive KYC / proof uploads are NOT governed by this — they always
 * stay on the private local volume by design.
 *
 * `s3_secret_access_key_encrypted` is AES-256-GCM ciphertext (see
 * cashfree/crypto.ts). `AT_REST_ENCRYPTION_KEY` must be set.
 */
export const FileStorageSetting = model.define("file_storage_setting", {
  id: model.id().primaryKey(),
  singleton_key: model.text().default("default"),

  /** "local" → private static/ disk. "s3" → any S3-compatible backend
   *  (R2 / AWS / MinIO / Wasabi / DO), distinguished by endpoint. */
  provider: model.enum(["local", "s3"]).default("local"),

  /** UI-only hint: which provider preset the admin picked, so the
   *  settings page can re-render the right tailored form on reload
   *  (the underlying provider only cares about endpoint/region/keys).
   *  One of: r2 | aws | minio | wasabi | do | other. Null for local. */
  provider_preset: model.text().nullable(),

  // ── S3-compatible settings ───────────────────────────────────────
  s3_bucket: model.text().nullable(),
  /** Endpoint host. R2: https://<account_id>.r2.cloudflarestorage.com.
   *  AWS: leave blank (SDK derives from region) or s3.<region>.amazonaws.com.
   *  MinIO/Wasabi/DO: their endpoint. */
  s3_endpoint: model.text().nullable(),
  /** R2 ignores region but the SDK needs a value → "auto". */
  s3_region: model.text().default("auto"),
  /** Public base URL files are served from (e.g. https://cdn.risitex.com). */
  s3_file_url: model.text().nullable(),
  /** Optional key prefix, e.g. "public/". */
  s3_prefix: model.text().nullable(),
  /** MinIO / some self-hosted S3 need path-style addressing. R2/AWS = false. */
  s3_force_path_style: model.boolean().default(false),
  /** Cache-Control header written on every object. */
  s3_cache_control: model
    .text()
    .default("public, max-age=31536000, immutable"),
  /** Access key id — stored plain (it's an identifier, not the secret),
   *  mirroring how cashfree_setting stores client_id. */
  s3_access_key_id: model.text().nullable(),
  /** AES-256-GCM ciphertext of the secret access key. */
  s3_secret_access_key_encrypted: model.text().nullable(),

  updated_by_user_id: model.text().nullable(),
})
