import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DeleteBucketCommand } from "@aws-sdk/client-s3"
import { s3FromSavedConfig } from "../route"
import { logger } from "../../../../../utils/logger"

/**
 * DELETE /admin/file-storage/buckets/:name — delete a bucket on the saved
 * S3 backend.
 *
 * S3/R2 only allow deleting an EMPTY bucket, which is the natural guard
 * against nuking live assets. Requires an Admin Read & Write token.
 */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const name = req.params.name
  if (!name) {
    return res.status(400).json({ ok: false, message: "Bucket name required" })
  }
  try {
    const scope = (req.query as any)?.scope === "private" ? "private" : "public"
    const { client } = await s3FromSavedConfig(req.scope, scope)
    await client.send(new DeleteBucketCommand({ Bucket: name }))
    res.json({ ok: true, message: `Bucket "${name}" deleted.` })
  } catch (err) {
    let msg = (err as Error).message || "Failed to delete bucket"
    // R2/S3 reject non-empty buckets — make that human-readable.
    if (/not empty|BucketNotEmpty/i.test(msg)) {
      msg = "Bucket is not empty. Empty it first (delete its objects), then retry."
    }
    logger.warn("file-storage delete bucket failed", { error: msg })
    res.status(200).json({ ok: false, message: msg.slice(0, 300) })
  }
}
