import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { randomBytes } from "crypto"
import {
  SAVED_CART_MODULE,
  SavedCartModuleService,
} from "../../../../../modules/saved_cart"
import { logger } from "../../../../../utils/logger"

/**
 * POST /store/saved-carts/:id/share
 *
 * Mint (or return existing) URL-safe `share_token` for this saved
 * cart. Anyone with the token can subsequently call
 * GET /store/shared-carts/:token to view the cart — no auth needed.
 *
 * Security model:
 *   - Token is 32 random bytes → 43-char URL-safe base64. Cryptographic
 *     birthday collision probability vanishes well under any traffic
 *     we'll realistically see; uniqueness still enforced by partial
 *     unique index.
 *   - Token is the only credential, so anyone the owner shares the
 *     link with can see the cart contents (item / price snapshot).
 *     Acceptable for textile shopping carts — low sensitivity, the
 *     storefront warns the user when they copy the link.
 *   - Token is idempotent — re-sharing returns the same value so the
 *     same link keeps working.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  const { id } = req.params as { id: string }
  if (!id) {
    return res.status(400).json({ message: "id required" })
  }

  try {
    const svc = req.scope.resolve(
      SAVED_CART_MODULE,
    ) as SavedCartModuleService
    const existing = await (
      svc as unknown as {
        retrieveSavedCart: (id: string) => Promise<{
          id: string
          customer_id: string
          share_token: string | null
        } | null>
      }
    )
      .retrieveSavedCart(id)
      .catch(() => null)
    if (!existing) {
      return res.status(404).json({ message: "Saved cart not found" })
    }
    if (existing.customer_id !== customerId) {
      return res.status(403).json({ message: "Not your saved cart" })
    }

    let token = existing.share_token
    if (!token) {
      token = randomBytes(32).toString("base64url")
      await (
        svc as unknown as {
          updateSavedCarts: (
            input: Array<Record<string, unknown>>,
          ) => Promise<any>
        }
      ).updateSavedCarts([
        {
          id,
          share_token: token,
          share_token_created_at: new Date(),
        },
      ])
    }

    return res.json({ share_token: token })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/saved-carts/:id/share] failed", {
      customer_id: customerId,
      id,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't create share link.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
