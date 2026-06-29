import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { FILE_STORAGE_MODULE, FileStorageService } from "../../../../modules/file_storage"
import { logger } from "../../../../utils/logger"

/**
 * POST /admin/file-storage/test
 *
 * Verifies an S3-compatible config by writing a tiny object then
 * deleting it (proves both credentials AND write/delete perms — more
 * reliable than HeadBucket, which scoped R2 tokens often disallow).
 *
 * Uses the values in the request body; if `secret_access_key` is omitted
 * it falls back to the saved (decrypted) secret, so an admin can re-test
 * the stored config without re-typing it.
 */
const TestSchema = z.object({
  scope: z.enum(["public", "private"]).optional(),
  s3_bucket: z.string().min(1),
  // nullable — AWS S3 sends null (the SDK derives the endpoint from region).
  s3_endpoint: z.string().nullable().optional(),
  s3_region: z.string().nullable().optional(),
  s3_force_path_style: z.boolean().optional(),
  s3_access_key_id: z.string().min(1),
  secret_access_key: z.string().nullable().optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = TestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, message: "Bucket and access key id are required." })
  }
  const d = parsed.data
  try {
    let secret = d.secret_access_key
    if (!secret) {
      const svc = req.scope.resolve(FILE_STORAGE_MODULE) as FileStorageService
      secret = (await svc.peekSecret(d.scope ?? "public")) ?? undefined
    }
    if (!secret) {
      return res.status(400).json({
        ok: false,
        message: "No secret access key provided or stored.",
      })
    }

    const client = new S3Client({
      region: d.s3_region || "auto",
      endpoint: d.s3_endpoint || undefined,
      forcePathStyle: !!d.s3_force_path_style,
      credentials: { accessKeyId: d.s3_access_key_id, secretAccessKey: secret },
    })
    const key = `__connection_test__/${Date.now()}.txt`
    await client.send(
      new PutObjectCommand({
        Bucket: d.s3_bucket,
        Key: key,
        Body: "ok",
        ContentType: "text/plain",
      }),
    )
    await client
      .send(new DeleteObjectCommand({ Bucket: d.s3_bucket, Key: key }))
      .catch(() => {}) // write succeeded; delete failure shouldn't fail the test

    res.json({ ok: true, message: "Connection OK — wrote and removed a test object." })
  } catch (err) {
    const msg = (err as Error).message || "Connection failed"
    logger.warn("file-storage test failed", { error: msg })
    res.status(200).json({ ok: false, message: msg.slice(0, 300) })
  }
}
