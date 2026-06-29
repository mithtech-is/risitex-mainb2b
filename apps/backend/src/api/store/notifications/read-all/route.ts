import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export const PATCH = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  try {
    const customerId = (req as any).auth_context?.app_metadata?.customer_id
    if (!customerId) {
      return res.status(401).json({ message: "Not authenticated" })
    }

    const polemarchModule = req.scope.resolve("polemarch") as any
    const notifications = typeof polemarchModule.listNotifications === "function"
      ? await polemarchModule.listNotifications({ customer_id: customerId, is_read: false })
      : (await polemarchModule.listAndCountNotifications(
          { customer_id: customerId, is_read: false },
          {}
        ))?.[0] || []

    await Promise.all(
      (notifications || []).map((notification: any) =>
        polemarchModule.updateNotifications({
          id: notification.id,
          is_read: true,
        })
      )
    )

    res.json({ message: "All notifications marked as read" })
  } catch (error: any) {
    console.error("Failed to mark all notifications as read:", error)
    res.status(500).json({ message: error?.message || "Failed to update notifications" })
  }
}
