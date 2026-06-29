import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3"
import { FILE_STORAGE_MODULE, FileStorageService } from "../../../../modules/file_storage"
import { logger } from "../../../../utils/logger"

/**
 * GET /admin/media/library — list every image in the PUBLIC storage
 * bucket (product logos / images), with which product(s) reference each
 * one. Powers the Media Explorer.
 *
 * Only works when public storage is on an S3-compatible backend (R2 etc.)
 * — listing the local volume isn't exposed here. Needs an Admin Read &
 * Write token for ListObjects.
 */

const IMG_RE = /\.(png|jpe?g|webp|gif|avif|svg)$/i

/** Build an S3 client + bucket/url context from the saved PUBLIC config. */
export async function publicS3(container: any): Promise<{
  client: S3Client
  bucket: string
  fileUrl: string
  prefix: string
}> {
  const svc = container.resolve(FILE_STORAGE_MODULE) as FileStorageService
  const view = await svc.getView("public")
  if (view.provider !== "s3" || !view.s3_bucket || !view.s3_access_key_id) {
    throw new Error(
      "Public storage isn't on an S3 backend — set it to R2/S3 in File storage to use the Media library.",
    )
  }
  const secret = await svc.peekSecret("public")
  if (!secret) throw new Error("Public storage secret key isn't saved.")
  const client = new S3Client({
    region: view.s3_region || "auto",
    endpoint: view.s3_endpoint || undefined,
    forcePathStyle: !!view.s3_force_path_style,
    credentials: { accessKeyId: view.s3_access_key_id, secretAccessKey: secret },
  })
  return {
    client,
    bucket: view.s3_bucket,
    fileUrl: (view.s3_file_url || "").replace(/\/$/, ""),
    prefix: view.s3_prefix || "",
  }
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { client, bucket, fileUrl, prefix } = await publicS3(req.scope)
    const out = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, MaxKeys: 1000 }),
    )
    const images = (out.Contents ?? [])
      .filter((o) => o.Key && IMG_RE.test(o.Key))
      .map((o) => ({
        key: o.Key as string,
        url: `${fileUrl}/${o.Key}`,
        size: o.Size ?? 0,
        last_modified: o.LastModified ?? null,
      }))
      .sort((a, b) => (b.last_modified?.valueOf() ?? 0) - (a.last_modified?.valueOf() ?? 0))

    // "used by" — match each image URL against product thumbnails.
    const knex: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const prods = await knex("product")
      .select("id", "title", "thumbnail")
      .whereNotNull("thumbnail")
      .whereNull("deleted_at")
    const byUrl = new Map<string, { id: string; title: string }[]>()
    for (const p of prods) {
      if (!p.thumbnail) continue
      const arr = byUrl.get(p.thumbnail) ?? []
      arr.push({ id: p.id, title: p.title })
      byUrl.set(p.thumbnail, arr)
    }

    res.json({
      images: images.map((im) => ({ ...im, used_by: byUrl.get(im.url) ?? [] })),
      count: images.length,
      file_url: fileUrl,
    })
  } catch (err) {
    const msg = (err as Error).message || "Failed to list media"
    logger.warn("media library failed", { error: msg })
    res.status(200).json({ images: null, error: msg.slice(0, 300) })
  }
}
