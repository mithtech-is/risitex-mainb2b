import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import { publicS3 } from "../library/route"
import { logger } from "../../../../utils/logger"

/**
 * POST /admin/media/delete — permanently delete an image from the PUBLIC
 * bucket. Object-level op (works with an object-scoped token).
 *
 * Body: { key }
 *
 * Note: this does NOT clear product references — if the image was a
 * product thumbnail, that product is left pointing at a now-404 URL. The
 * UI warns when an image is in use before letting you delete it.
 */
const BodySchema = z.object({ key: z.string().min(1).max(1024) })

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "key required" })
  }
  // Guard against path-ish keys reaching anything unexpected.
  if (parsed.data.key.startsWith("/") || parsed.data.key.includes("..")) {
    return res.status(400).json({ ok: false, message: "invalid key" })
  }
  try {
    const { client, bucket } = await publicS3(req.scope)
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: parsed.data.key }))
    res.json({ ok: true, message: "Deleted." })
  } catch (err) {
    const msg = (err as Error).message || "delete failed"
    logger.warn("media delete failed", { error: msg })
    res.status(200).json({ ok: false, message: msg.slice(0, 300) })
  }
}
