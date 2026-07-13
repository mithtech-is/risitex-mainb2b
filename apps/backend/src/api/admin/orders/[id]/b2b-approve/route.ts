import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../../../modules/purchase_order"
import { logger } from "../../../../../utils/logger"

/**
 * POST /admin/orders/:id/b2b-approve
 *
 * Admin approves a B2B order directly from the native Medusa Order
 * details page. `:id` is the ORDER id (not the PO id).
 *
 * Unlike the legacy /admin/purchase-orders/:id/approve-payment route,
 * this does NOT require buyer-recorded payment proof
 * (metadata.payment_confirmed_at) — that gate caused a deadlock for
 * B2B orders that have no separate buyer payment step. Approval here
 * is a pure admin action.
 *
 * Stamps admin_approved_at (+ actor) on the linked purchase_order's
 * metadata (read by the storefront's PO tracking views), and mirrors
 * a b2b_approved_at flag onto the order's own metadata so the admin
 * widget can read state without a second lookup.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id: orderId } = req.params as { id: string }
  if (!orderId) return res.status(400).json({ message: "Order id required" })

  const actorId =
    (req as any).user?.id ?? (req as any).auth_context?.actor_id ?? null
  const actorName =
    (req as any).user?.email ??
    (req as any).user?.first_name ??
    (req as any).auth_context?.actor_name ??
    "admin"

  const svc = req.scope.resolve(
    PURCHASE_ORDER_MODULE,
  ) as PurchaseOrderModuleService

  try {
    const [po] = await (
      svc as unknown as {
        listPurchaseOrders: (
          filters: Record<string, unknown>,
        ) => Promise<any[]>
      }
    ).listPurchaseOrders({ order_id: orderId })

    const now = new Date().toISOString()

    if (po) {
      const meta = (po.metadata ?? {}) as Record<string, unknown>
      if (meta.admin_approved_at) {
        return res.status(409).json({
          message: "This order has already been approved.",
          admin_approved_at: meta.admin_approved_at,
        })
      }

      const nextMeta = {
        ...meta,
        admin_approved_at: now,
        admin_approved_by_id: actorId,
        admin_approved_by_name: actorName,
      }

      await (
        svc as unknown as {
          updatePurchaseOrders: (
            rows: Array<Record<string, unknown>>,
          ) => Promise<any>
        }
      ).updatePurchaseOrders([{ id: po.id, metadata: nextMeta }])

      // Best-effort: capture a payment transaction on the linked order.
      try {
        const orderModule = req.scope.resolve(Modules.ORDER)
        await orderModule.addOrderTransactions({
          order_id: orderId,
          amount: po.value_minor ?? (po.value_major ?? 0) * 100,
          currency_code: po.currency_code || "inr",
          reference: "po_approval",
          reference_id: po.id,
        })
      } catch (txErr) {
        logger.warn(
          `[b2b-approve] failed to register transaction for order ${orderId}: ${txErr instanceof Error ? txErr.message : txErr}`,
        )
      }
    } else {
      logger.warn(
        `[b2b-approve] no linked purchase_order found for order ${orderId} — approving order metadata only`,
      )
    }

    // Best-effort: mirror approval onto the order's own metadata so the
    // widget can read state directly from `data` without a second call.
    try {
      const orderModule = req.scope.resolve(Modules.ORDER)
      const order = await orderModule.retrieveOrder(orderId)
      await orderModule.updateOrders([
        {
          id: orderId,
          metadata: {
            ...(order.metadata || {}),
            b2b_approved_at: now,
            b2b_approved_by_name: actorName,
          },
        },
      ])
    } catch (metaErr) {
      logger.warn(
        `[b2b-approve] failed to mirror approval onto order ${orderId} metadata: ${metaErr instanceof Error ? metaErr.message : metaErr}`,
      )
    }

    logger.info("B2B order approved by admin", {
      order_id: orderId,
      po_id: po?.id,
      actor: actorName,
    })

    return res.json({ ok: true, admin_approved_at: now })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("b2b-approve failed", { order_id: orderId, error: msg })
    return res.status(500).json({ message: msg })
  }
}
