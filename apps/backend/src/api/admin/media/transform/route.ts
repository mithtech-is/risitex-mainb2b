import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import sharp from "sharp"
import { logger } from "../../../../utils/logger"

/**
 * POST /admin/media/transform
 *
 * Runs a sharp pipeline over a source image and saves the result to the
 * PUBLIC storage backend (R2) as a NEW object. Ops are applied in order.
 *
 * Body: { source_url, ops: Op[], filename? }
 *   Op =
 *     | { type: "trim", threshold?: number }
 *     | { type: "resize", width?, height?, fit?, position? }
 *     | { type: "rotate", angle: 90|180|270 }
 *     | { type: "flip" } | { type: "flop" }
 *     | { type: "variant", theme: "light"|"dark", padding?, radius? }
 *     | { type: "format", format: "webp"|"png"|"jpeg", quality? }
 */

const OpSchema = z.array(z.record(z.string(), z.any())).max(20)
const BodySchema = z.object({
  source_url: z.string().url(),
  ops: OpSchema,
  filename: z.string().max(120).optional(),
})

const THEMES: Record<string, { r: number; g: number; b: number }> = {
  light: { r: 255, g: 255, b: 255 },
  dark: { r: 15, g: 23, b: 42 }, // slate-900
}

async function makeVariant(
  buf: Buffer,
  op: any,
): Promise<Buffer> {
  const size = 512
  const padding = Math.max(0, Math.min(220, Number(op.padding ?? 72)))
  const radius = Math.max(0, Math.min(size / 2, Number(op.radius ?? 96)))
  const bg = THEMES[op.theme === "dark" ? "dark" : "light"]
  const inner = size - padding * 2
  const logo = await sharp(buf, { failOn: "none" })
    .resize(inner, inner, { fit: "inside", withoutEnlargement: false })
    .toBuffer()
  let tile = await sharp({
    create: { width: size, height: size, channels: 4, background: { ...bg, alpha: 1 } },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer()
  if (radius > 0) {
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`,
    )
    tile = await sharp(tile)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer()
  }
  return tile
}

async function applyOps(input: Buffer, ops: any[]): Promise<{ buffer: Buffer; ext: string }> {
  let img = sharp(input, { failOn: "none" })
  let format: "webp" | "png" | "jpeg" | "avif" = "webp"
  let quality = 82
  for (const op of ops) {
    switch (op?.type) {
      case "trim":
        img = img.trim(
          typeof op.threshold === "number" ? { threshold: op.threshold } : undefined,
        )
        break
      case "resize":
        img = img.resize(op.width || null, op.height || null, {
          fit: op.fit || "inside",
          position: op.position || "centre",
          withoutEnlargement: op.withoutEnlargement !== false,
        })
        break
      case "rotate":
        img = img.rotate(Number(op.angle) || 0)
        break
      case "flip":
        img = img.flip()
        break
      case "flop":
        img = img.flop()
        break
      case "variant": {
        const cur = await img.png().toBuffer()
        img = sharp(await makeVariant(cur, op), { failOn: "none" })
        break
      }
      case "keyout": {
        // Make a solid background colour transparent (default near-white).
        // Perfect for logos on a flat backdrop; no ML needed.
        const { data, info } = await img
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
        const ch = info.channels
        const target: number[] = Array.isArray(op.color) ? op.color : [255, 255, 255]
        const tol = Math.max(2, Math.min(160, Number(op.tolerance ?? 48)))
        const inner = tol * 0.5
        for (let i = 0; i < data.length; i += ch) {
          const dr = data[i] - target[0]
          const dg = data[i + 1] - target[1]
          const db = data[i + 2] - target[2]
          const dist = Math.sqrt(dr * dr + dg * dg + db * db)
          const a = i + ch - 1
          if (dist <= inner) data[a] = 0
          else if (dist < tol)
            data[a] = Math.min(data[a], Math.round(((dist - inner) / (tol - inner)) * 255))
        }
        img = sharp(Buffer.from(data), {
          raw: { width: info.width, height: info.height, channels: ch },
          failOn: "none",
        })
        break
      }
      case "format":
        format = ["webp", "png", "jpeg", "avif"].includes(op.format) ? op.format : "webp"
        if (typeof op.quality === "number") quality = Math.max(1, Math.min(100, op.quality))
        break
    }
  }
  if (format === "webp") img = img.webp({ quality })
  else if (format === "avif") img = img.avif({ quality })
  else if (format === "png") img = img.png({ compressionLevel: 9, palette: true })
  else img = img.jpeg({ quality, mozjpeg: true })
  return { buffer: await img.toBuffer(), ext: format === "jpeg" ? "jpg" : format }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "source_url + ops required" })
  }
  try {
    const r = await fetch(parsed.data.source_url)
    if (!r.ok) throw new Error(`fetch source ${r.status}`)
    const srcBuf = Buffer.from(await r.arrayBuffer())

    const { buffer, ext } = await applyOps(srcBuf, parsed.data.ops)

    // Build a stable-ish filename: keep the source base, add ops hint.
    const srcBase = (parsed.data.source_url.split("/").pop() || "image")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80)
    const hint =
      parsed.data.ops.find((o: any) => o.type === "variant")?.theme ??
      (parsed.data.ops.some((o: any) => o.type === "trim") ? "trim" : "opt")
    const filename = (parsed.data.filename || `${srcBase}-${hint}`).replace(/[^a-zA-Z0-9._-]/g, "_")

    const fileModule: any = req.scope.resolve(Modules.FILE)
    const [created] = await fileModule.createFiles([
      {
        filename: `${filename}.${ext}`,
        mimeType:
          ext === "png" ? "image/png"
          : ext === "jpg" ? "image/jpeg"
          : ext === "avif" ? "image/avif"
          : "image/webp",
        content: buffer.toString("base64"),
        access: "public",
      },
    ])
    res.json({ ok: true, url: created.url, bytes: buffer.length })
  } catch (err) {
    const msg = (err as Error).message || "transform failed"
    logger.warn("media transform failed", { error: msg })
    res.status(200).json({ ok: false, message: msg.slice(0, 300) })
  }
}
