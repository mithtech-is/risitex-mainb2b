import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { logger } from "../../../../utils/logger"

/**
 * POST /admin/media/apply — set a media image as a product's thumbnail
 * (and optionally its first gallery image).
 *
 * Body: { product_id, url, also_image? }
 */
const BodySchema = z.object({
  product_id: z.string().min(1),
  url: z.string().url(),
  also_image: z.boolean().optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "product_id + url required" })
  }
  try {
    const productModule: any = req.scope.resolve(Modules.PRODUCT)
    const data: Record<string, unknown> = { thumbnail: parsed.data.url }
    if (parsed.data.also_image) data.images = [{ url: parsed.data.url }]
    await productModule.updateProducts(parsed.data.product_id, data)
    res.json({ ok: true, message: "Applied to product." })
  } catch (err) {
    const msg = (err as Error).message || "apply failed"
    logger.warn("media apply failed", { error: msg })
    res.status(200).json({ ok: false, message: msg.slice(0, 300) })
  }
}
