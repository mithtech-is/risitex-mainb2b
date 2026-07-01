import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  SAVED_CART_MODULE,
  SavedCartModuleService,
} from "../../../../modules/saved_cart"
import { logger } from "../../../../utils/logger"

/**
 * PATCH /store/saved-carts/:id
 *
 * Update saved cart metadata (name, note). Ownership is enforced.
 */
export const PATCH = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  const { id } = req.params as { id: string }
  const { name } = req.body as { name?: string }
  if (!name?.trim()) {
    return res.status(422).json({ message: "name is required" })
  }
  try {
    const svc = req.scope.resolve(
      SAVED_CART_MODULE,
    ) as SavedCartModuleService
    const existing = await (
      svc as unknown as {
        retrieveSavedCart: (
          id: string,
        ) => Promise<{ id: string; customer_id: string } | null>
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
    await (svc as unknown as {
      updateSavedCarts: (input: { id: string; name: string }[]) => Promise<void>
    }).updateSavedCarts([{ id, name: name.trim() }])
    return res.json({ ok: true, updated: id })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/saved-carts/:id] patch failed", {
      customer_id: customerId,
      id,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't update the saved cart.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}

/**
 * DELETE /store/saved-carts/:id
 *
 * Soft-delete a saved cart. Ownership is enforced by re-reading the
 * row and comparing customer_id; otherwise an authenticated customer
 * could nuke any row by guessing the id.
 */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
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
        retrieveSavedCart: (
          id: string,
        ) => Promise<{ id: string; customer_id: string } | null>
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

    await (
      svc as unknown as {
        deleteSavedCarts: (ids: string | string[]) => Promise<void>
      }
    ).deleteSavedCarts(id)

    return res.json({ ok: true, deleted: id })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/saved-carts/:id] delete failed", {
      customer_id: customerId,
      id,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't delete the saved cart.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
