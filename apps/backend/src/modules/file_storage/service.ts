import { MedusaService } from "@medusajs/framework/utils"
import { FileStorageSetting } from "./models/file-storage-setting"
import { encryptString, decryptString } from "../cashfree_wallet/cashfree/crypto"

export type FileStorageView = {
  provider: "local" | "s3"
  /** UI hint: r2 | aws | minio | wasabi | do | other (null for local). */
  provider_preset: string | null
  s3_bucket: string | null
  s3_endpoint: string | null
  s3_region: string
  s3_file_url: string | null
  s3_prefix: string | null
  s3_force_path_style: boolean
  s3_cache_control: string
  s3_access_key_id: string | null
  /** Never the plaintext secret — only whether one is stored. */
  has_secret_access_key: boolean
}

export type StorageScope = "public" | "private"

class FileStorageService extends MedusaService({ FileStorageSetting }) {
  /** A scope maps 1:1 to a singleton row (singleton_key = scope).
   *  "public" also matches the legacy "default" key for safety before the
   *  scope-split migration has run. */
  private async loadRow(scope: StorageScope = "public"): Promise<any | null> {
    const keys = scope === "public" ? ["public", "default"] : ["private"]
    const rows = await this.listFileStorageSettings(
      { singleton_key: keys },
      { take: 2 },
    )
    if (!rows?.length) return null
    // Prefer the canonical scope key over the legacy "default".
    return rows.find((r: any) => r.singleton_key === scope) ?? rows[0]
  }

  /** Admin-facing read — secret is masked (returns only `has_secret_access_key`). */
  async getView(scope: StorageScope = "public"): Promise<FileStorageView> {
    const row = await this.loadRow(scope)
    return {
      provider: (row?.provider as "local" | "s3") ?? "local",
      provider_preset: row?.provider_preset ?? null,
      s3_bucket: row?.s3_bucket ?? null,
      s3_endpoint: row?.s3_endpoint ?? null,
      s3_region: row?.s3_region ?? "auto",
      s3_file_url: row?.s3_file_url ?? null,
      s3_prefix: row?.s3_prefix ?? null,
      s3_force_path_style: !!row?.s3_force_path_style,
      s3_cache_control:
        row?.s3_cache_control ?? "public, max-age=31536000, immutable",
      s3_access_key_id: row?.s3_access_key_id ?? null,
      has_secret_access_key: !!row?.s3_secret_access_key_encrypted,
    }
  }

  /** Internal: decrypted saved secret (for the connection-test route).
   *  Never exposed via getView(). */
  async peekSecret(scope: StorageScope = "public"): Promise<string | null> {
    const row = await this.loadRow(scope)
    if (!row?.s3_secret_access_key_encrypted) return null
    try {
      return decryptString(row.s3_secret_access_key_encrypted)
    } catch {
      return null
    }
  }

  /** Partial update — only fields the caller sends are written. The
   *  secret access key is encrypted; pass an empty string to leave it
   *  unchanged, or a sentinel to clear it. */
  async save(input: {
    scope?: StorageScope
    provider?: "local" | "s3"
    provider_preset?: string | null
    s3_bucket?: string | null
    s3_endpoint?: string | null
    s3_region?: string
    s3_file_url?: string | null
    s3_prefix?: string | null
    s3_force_path_style?: boolean
    s3_cache_control?: string
    s3_access_key_id?: string | null
    /** Plaintext secret to encrypt + store. Omit / undefined to keep the
     *  existing one; pass "" or null to clear it. */
    secret_access_key?: string | null
    updated_by_user_id?: string | null
  }): Promise<FileStorageView> {
    const scope: StorageScope = input.scope ?? "public"
    const row = await this.loadRow(scope)
    const data: Record<string, unknown> = {}
    const set = (k: string, v: unknown) => {
      if (v !== undefined) data[k] = v
    }
    set("provider", input.provider)
    set("provider_preset", input.provider_preset)
    set("s3_bucket", input.s3_bucket)
    set("s3_endpoint", input.s3_endpoint)
    set("s3_region", input.s3_region)
    set("s3_file_url", input.s3_file_url)
    set("s3_prefix", input.s3_prefix)
    set("s3_force_path_style", input.s3_force_path_style)
    set("s3_cache_control", input.s3_cache_control)
    set("s3_access_key_id", input.s3_access_key_id)
    set("updated_by_user_id", input.updated_by_user_id)
    if (input.secret_access_key !== undefined) {
      data.s3_secret_access_key_encrypted =
        input.secret_access_key === null || input.secret_access_key === ""
          ? null
          : encryptString(input.secret_access_key)
    }

    if (row) {
      await this.updateFileStorageSettings({ id: row.id, ...data })
    } else {
      await this.createFileStorageSettings({ singleton_key: scope, ...data })
    }
    return this.getView(scope)
  }
}

export default FileStorageService
