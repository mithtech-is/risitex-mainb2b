import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import sharp from "sharp"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import { logger } from "../../../../utils/logger"

const pexec = promisify(execFile)

/**
 * POST /admin/media/remove-bg
 *
 * Self-hosted background removal via @imgly/background-removal-node (ONNX,
 * no external API). The actual inference runs in an ISOLATED child
 * process (src/scripts/bg-worker.mjs) so its ~1GB memory spike / native
 * code can't OOM-kill or crash the Medusa server — if the worker dies the
 * route returns a clean error. The cut-out is alpha-trimmed → WebP and
 * saved to the PUBLIC bucket.
 *
 * Body: { source_url, trim?: boolean }
 */
const BodySchema = z.object({
  source_url: z.string().url(),
  trim: z.boolean().optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "source_url required" })
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const inPath = path.join(os.tmpdir(), `bg-${id}-in`)
  const outPath = path.join(os.tmpdir(), `bg-${id}-out.png`)
  try {
    const r = await fetch(parsed.data.source_url)
    if (!r.ok) throw new Error(`fetch source ${r.status}`)
    await fs.writeFile(inPath, Buffer.from(await r.arrayBuffer()))

    const worker = path.join(process.cwd(), "src", "scripts", "bg-worker.mjs")
    try {
      await pexec(process.execPath, [worker, inPath, outPath], {
        timeout: 120_000,
        maxBuffer: 1 << 20,
      })
    } catch (e: any) {
      const msg = e?.message || e?.stderr || ""
      const isModelError = /model does not support|Cannot read|onnx|model.*fail|background.removal.*not available/i.test(String(msg))
      if (isModelError) {
        logger.warn("bg-worker failed: ONNX model error", { error: msg })
        return res.status(200).json({
          ok: false,
          message:
            "Background removal model is not available. Clear the model cache (~/.imgly) and restart, or contact support.",
        })
      }
      logger.warn("bg-worker failed", { error: msg })
      return res.status(200).json({
        ok: false,
        message:
          "Background removal couldn't complete (the server ran low on memory for this image). Try a smaller image, or retry.",
      })
    }

    const cut = await fs.readFile(outPath)
    let img = sharp(cut, { failOn: "none" })
    if (parsed.data.trim !== false) img = img.trim()
    const out = await img.webp({ quality: 90 }).toBuffer()

    const srcBase = (parsed.data.source_url.split("/").pop() || "image")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80)

    const fileModule: any = req.scope.resolve(Modules.FILE)
    const [created] = await fileModule.createFiles([
      {
        filename: `${srcBase}-nobg.webp`,
        mimeType: "image/webp",
        content: out.toString("base64"),
        access: "public",
      },
    ])
    res.json({ ok: true, url: created.url, bytes: out.length })
  } catch (err) {
    const msg = (err as Error).message || "background removal failed"
    logger.warn("media remove-bg failed", { error: msg })
    res.status(200).json({ ok: false, message: msg.slice(0, 300) })
  } finally {
    // best-effort temp cleanup
    fs.unlink(inPath).catch(() => {})
    fs.unlink(outPath).catch(() => {})
  }
}
