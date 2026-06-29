import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  SAVED_CART_MODULE,
  SavedCartModuleService,
} from "../../../../modules/saved_cart"
import { logger } from "../../../../utils/logger"

/**
 * GET /store/shared-carts/:token
 *
 * Public read endpoint for a saved cart shared via /store/saved-carts/
 * :id/share. NO auth — the token IS the credential. Returns the cart
 * lines + a privacy-redacted owner name (first + last initial) so the
 * recipient knows whose cart they're looking at.
 *
 * If the token isn't found → 404. We use 404 not 401 so existence
 * isn't leaked via response timing or status differential.
 *
 * Owner name lookup is best-effort: a private cart whose owner has
 * since deleted their account still resolves the cart but shows
 * "Shared by a colleague" instead of a name.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { token } = req.params as { token: string }
  if (!token) {
    return res.status(400).json({ message: "token required" })
  }

  try {
    const svc = req.scope.resolve(
      SAVED_CART_MODULE,
    ) as SavedCartModuleService
    const [rows] = await (
      svc as unknown as {
        listAndCountSavedCarts: (
          filters: Record<string, unknown>,
          config?: { take?: number },
        ) => Promise<[any[], number]>
      }
    ).listAndCountSavedCarts({ share_token: token }, { take: 1 })
    const cart = rows?.[0]
    if (!cart) {
      return res.status(404).json({ message: "Shared cart not found" })
    }

    // Best-effort owner name lookup (privacy-redacted to first + L.).
    let ownerName: string | null = null
    try {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: customers } = await query.graph({
        entity: "customer",
        fields: ["id", "first_name", "last_name"],
        filters: { id: cart.customer_id as string },
      })
      const c = customers?.[0] as
        | { first_name?: string | null; last_name?: string | null }
        | undefined
      if (c) {
        const first = (c.first_name ?? "").trim()
        const lastInit = (c.last_name ?? "").trim().charAt(0)
        const name = [first, lastInit ? `${lastInit}.` : ""]
          .filter(Boolean)
          .join(" ")
        ownerName = name || null
      }
    } catch {
      // ignore — owner name is best-effort
    }

    return res.json({
      shared_cart: {
        id: cart.id,
        name: cart.name,
        note: cart.note,
        lines: cart.lines,
        item_count: Number(cart.item_count ?? 0),
        total_major: Math.round(Number(cart.total_minor ?? 0) / 100),
        currency_code: cart.currency_code ?? "inr",
        owner_name: ownerName,
        created_at: cart.created_at,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/shared-carts/:token] failed", {
      token,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't load shared cart.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
