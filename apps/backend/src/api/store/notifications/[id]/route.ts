import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * DELETE /store/notifications/:id
 *
 * Clears a single notification for the logged-in customer. Soft-delete
 * via the MedusaService-generated `deleteNotifications` — the row is
 * marked `deleted_at` and the storefront list filter (which respects
 * deleted_at by default) stops surfacing it.
 *
 * Ownership-checked: the notification must belong to the requesting
 * customer; otherwise 403.
 */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const customerId = (req as any).auth_context?.app_metadata?.customer_id
    if (!customerId) {
      return res.status(401).json({ message: "Not authenticated" })
    }

    const { id } = req.params as { id: string }
    if (!id) return res.status(400).json({ message: "Missing id" })

    const polemarchModule = req.scope.resolve("polemarch") as any
    const notification = await polemarchModule
      .retrieveNotification(id)
      .catch(() => null)

    if (!notification) {
      // Treat as already-cleared rather than 404 — the UI optimistically
      // removes the row before this round-trip, so a 404 would look like
      // a phantom failure if the user double-clicks.
      return res.json({ id, deleted: true })
    }

    if (notification.customer_id !== customerId) {
      return res.status(403).json({ message: "Forbidden" })
    }

    await polemarchModule.deleteNotifications(id)
    res.json({ id, deleted: true })
  } catch (error: any) {
    console.error("[store/notifications DELETE] failed:", error)
    res
      .status(500)
      .json({ message: error?.message || "Failed to delete notification" })
  }
}
