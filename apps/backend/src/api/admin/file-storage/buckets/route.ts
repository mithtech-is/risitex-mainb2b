import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  S3Client,
  ListBucketsCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3"
import { FILE_STORAGE_MODULE, FileStorageService } from "../../../../modules/file_storage"
import { logger } from "../../../../utils/logger"

/**
 * GET  /admin/file-storage/buckets  — list buckets on the saved S3 backend.
 * POST /admin/file-storage/buckets  — create a bucket ({ name }).
 *
 * Uses the saved S3 config + decrypted secret. NOTE: bucket-level
 * operations (list / create / delete) require the token to have
 * **Admin Read & Write** permission — an "Object Read & Write" R2 token
 * can only touch objects, so these calls return an access-denied error
 * the UI surfaces verbatim.
 */

/** Build an S3 client from the saved file-storage config for a scope. */
export async function s3FromSavedConfig(
  container: any,
  scope: "public" | "private" = "public",
): Promise<{
  client: S3Client
  endpoint: string | null
}> {
  const svc = container.resolve(FILE_STORAGE_MODULE) as FileStorageService
  const view = await svc.getView(scope)
  if (view.provider !== "s3") {
    throw new Error(
      "This storage scope is set to Local disk — switch it to an S3 provider and save before managing buckets.",
    )
  }
  const secret = await svc.peekSecret(scope)
  if (!view.s3_access_key_id || !secret) {
    throw new Error("S3 credentials are not saved yet.")
  }
  const client = new S3Client({
    region: view.s3_region || "auto",
    endpoint: view.s3_endpoint || undefined,
    forcePathStyle: !!view.s3_force_path_style,
    credentials: {
      accessKeyId: view.s3_access_key_id,
      secretAccessKey: secret,
    },
  })
  return { client, endpoint: view.s3_endpoint ?? null }
}

/** R2/S3 bucket naming: 3–63 chars, lowercase letters, digits, hyphens;
 *  must start/end alphanumeric. */
const BucketName = z
  .string()
  .min(3)
  .max(63)
  .regex(
    /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
    "3–63 chars, lowercase letters/numbers/hyphens, start & end alphanumeric.",
  )

function scopeOf(v: unknown): "public" | "private" {
  return v === "private" ? "private" : "public"
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { client } = await s3FromSavedConfig(req.scope, scopeOf((req.query as any)?.scope))
    const out = await client.send(new ListBucketsCommand({}))
    res.json({
      buckets: (out.Buckets ?? []).map((b) => ({
        name: b.Name,
        created_at: b.CreationDate ?? null,
      })),
    })
  } catch (err) {
    const msg = (err as Error).message || "Failed to list buckets"
    logger.warn("file-storage list buckets failed", { error: msg })
    res.status(200).json({ buckets: null, error: msg.slice(0, 300) })
  }
}

const CreateSchema = z.object({
  name: BucketName,
  scope: z.enum(["public", "private"]).optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid bucket name",
    })
  }
  try {
    const { client } = await s3FromSavedConfig(req.scope, parsed.data.scope ?? "public")
    await client.send(new CreateBucketCommand({ Bucket: parsed.data.name }))
    res.json({ ok: true, message: `Bucket "${parsed.data.name}" created.` })
  } catch (err) {
    const msg = (err as Error).message || "Failed to create bucket"
    logger.warn("file-storage create bucket failed", { error: msg })
    res.status(200).json({ ok: false, message: msg.slice(0, 300) })
  }
}
