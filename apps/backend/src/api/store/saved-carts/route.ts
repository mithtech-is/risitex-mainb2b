import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  SAVED_CART_MODULE,
  SavedCartModuleService,
} from "../../../modules/saved_cart"
import { logger } from "../../../utils/logger"

/**
 * GET /store/saved-carts
 *
 * Customer-scoped list, newest-first. Returns the row shape verbatim
 * (storefront uses `lines` as a black-box snapshot of CartLine[]).
 *
 * POST /store/saved-carts
 *
 * Body: { name, lines: CartLine[], note?, shared_with?: string[] }
 *
 * `item_count` + `total_minor` are derived server-side from `lines`
 * so list views don't have to walk the array.
 */

const CartLineSchema = z.object({
  variantId: z.string().min(1),
  medusaVariantId: z.string().optional(),
  productSlug: z.string().min(1),
  productName: z.string().min(1),
  variantLabel: z.string().min(1),
  swatchHex: z.string().min(1),
  pricePerUnitMajor: z.number().nonnegative(),
  quantity: z.number().int().positive(),
})
const PostBody = z.object({
  name: z.string().min(1).max(200),
  lines: z.array(CartLineSchema).min(1).max(200),
  note: z.string().max(2_000).optional(),
  shared_with: z.array(z.string().email()).max(20).optional(),
})

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  try {
    const svc = req.scope.resolve(
      SAVED_CART_MODULE,
    ) as SavedCartModuleService
    const [rows] = await (
      svc as unknown as {
        listAndCountSavedCarts: (
          filters: Record<string, unknown>,
          config?: {
            take?: number
            order?: Record<string, "ASC" | "DESC">
          },
        ) => Promise<[any[], number]>
      }
    ).listAndCountSavedCarts(
      { customer_id: customerId },
      { take: 100, order: { created_at: "DESC" } },
    )

    return res.json({
      saved_carts: rows.map((r) => ({
        id: r.id,
        name: r.name,
        note: r.note,
        lines: r.lines,
        item_count: Number(r.item_count ?? 0),
        total_major: Math.round(Number(r.total_minor ?? 0) / 100),
        currency_code: r.currency_code ?? "inr",
        shared_with: (r.shared_with ?? []) as string[],
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/saved-carts] list failed", {
      customer_id: customerId,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't load saved carts.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  const parsed = PostBody.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  const { name, lines, note, shared_with } = parsed.data
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0)
  const totalMinor = lines.reduce(
    (s, l) => s + Math.round(l.pricePerUnitMajor * 100) * l.quantity,
    0,
  )

  try {
    const svc = req.scope.resolve(
      SAVED_CART_MODULE,
    ) as SavedCartModuleService
    const created = await (
      svc as unknown as {
        createSavedCarts: (
          input: Record<string, unknown>,
        ) => Promise<any | any[]>
      }
    ).createSavedCarts({
      customer_id: customerId,
      name,
      note: note ?? null,
      lines,
      item_count: itemCount,
      total_minor: totalMinor,
      currency_code: "inr",
      shared_with: shared_with ?? null,
    })
    const row = Array.isArray(created) ? created[0] : created
    return res.status(201).json({
      saved_cart: {
        id: row.id,
        name: row.name,
        note: row.note,
        lines: row.lines,
        item_count: Number(row.item_count ?? 0),
        total_major: Math.round(Number(row.total_minor ?? 0) / 100),
        currency_code: row.currency_code ?? "inr",
        shared_with: (row.shared_with ?? []) as string[],
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/saved-carts] create failed", {
      customer_id: customerId,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't save the cart.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
