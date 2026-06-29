import { model } from "@medusajs/framework/utils"

/**
 * In-app notification row. Rendered by the storefront's
 * <NotificationBell /> dropdown and marked read via the
 * /store/notifications/:id/read PATCH route.
 *
 * `link` is an optional deep-link path (e.g. /invest/zepto) that the
 * bell navigates to when the row is clicked. Null for informational
 * notifications that don't navigate anywhere.
 */
export const Notification = model.define("user_notifications", {
  id: model.id().primaryKey(),
  customer_id: model.text().index(),
  title: model.text(),
  message: model.text(),
  type: model.text(),
  is_read: model.boolean().default(false),
  link: model.text().nullable(),
})
