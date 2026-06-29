import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { FILE_STORAGE_MODULE, FileStorageService } from "../../../modules/file_storage"
import { logger } from "../../../utils/logger"

/**
 * GET  /admin/file-storage  — read the active public-file-storage config
 *                             (secret access key is masked).
 * POST /admin/file-storage  — save it. Partial update; the secret access
 *                             key is encrypted at rest. Omit `secret_access_key`
 *                             to keep the existing one; send "" to clear.
 *
 * Governs PUBLIC assets only (product images / logos). KYC/proof uploads
 * always stay on the private local volume regardless of this setting.
 */

const SCOPES = ["public", "private"] as const
function scopeOf(v: unknown): "public" | "private" {
  return v === "private" ? "private" : "public"
}

const SaveSchema = z.object({
  scope: z.enum(SCOPES).optional(),
  provider: z.enum(["local", "s3"]).optional(),
  // UI hint only — which preset form to re-render on reload.
  provider_preset: z
    .enum(["r2", "aws", "minio", "wasabi", "do", "other"])
    .nullable()
    .optional(),
  s3_bucket: z.string().max(255).nullable().optional(),
  s3_endpoint: z.string().max(500).nullable().optional(),
  s3_region: z.string().max(100).optional(),
  s3_file_url: z.string().max(500).nullable().optional(),
  s3_prefix: z.string().max(255).nullable().optional(),
  s3_force_path_style: z.boolean().optional(),
  s3_cache_control: z.string().max(255).optional(),
  s3_access_key_id: z.string().max(255).nullable().optional(),
  // Plaintext secret to encrypt; omit to keep, "" to clear.
  secret_access_key: z.string().max(1000).nullable().optional(),
})

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve(FILE_STORAGE_MODULE) as FileStorageService
  const scope = scopeOf((req.query as any)?.scope)
  try {
    res.json({ file_storage: await svc.getView(scope) })
  } catch (err) {
    logger.error("getFileStorage failed", { error: err })
    res.status(500).json({ message: (err as Error).message ?? "load_failed" })
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = SaveSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Invalid input", errors: parsed.error.issues })
  }
  const svc = req.scope.resolve(FILE_STORAGE_MODULE) as FileStorageService
  try {
    const updated_by_user_id =
      (req as any).auth_context?.actor_id ?? (req as any).user?.userId ?? null
    const view = await svc.save({ ...parsed.data, updated_by_user_id })
    res.json({ file_storage: view })
  } catch (err) {
    logger.error("saveFileStorage failed", { error: err })
    res.status(500).json({ message: (err as Error).message ?? "save_failed" })
  }
}
