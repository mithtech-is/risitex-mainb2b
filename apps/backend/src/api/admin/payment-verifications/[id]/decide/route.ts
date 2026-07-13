// apps/backend/src/api/admin/payment-verifications/[id]/decide/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../../../modules/purchase_order"
import { logger } from "../../../../../utils/logger"

const Body = z.object({
  decision: z.enum(["approve", "reject", "clarify"]),
  note: z.string().max(2000).optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const poId = req.params.id
  const parsed = Body.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ message: "Invalid input" })
  }
  const { decision, note } = parsed.data
  const actorName =
    (req as any).auth_context?.app_metadata?.first_name ||
    (req as any).auth_context?.actor_id ||
    "admin"

  try {
    const poModule = req.scope.resolve(
      PURCHASE_ORDER_MODULE,
    ) as PurchaseOrderModuleService & {
      retrievePurchaseOrder: (id: string) => Promise<any>
      updatePurchaseOrders: (data: any) => Promise<any>
    }
    const po = await poModule.retrievePurchaseOrder(poId)
    if (!po) return res.status(404).json({ message: "Purchase order not found." })

    const meta = (po.metadata ?? {}) as Record<string, unknown>
    const now = new Date().toISOString()
    let nextMeta: Record<string, unknown>
    let orderPaymentStatus: string

    if (decision === "approve") {
      // Idempotent: approving an already-approved PO is a no-op.
      nextMeta = {
        ...meta,
        payment_status: "paid",
        payment_verified_at: meta.payment_verified_at ?? now,
        payment_verified_by: meta.payment_verified_by ?? actorName,
        admin_approved_at: meta.admin_approved_at ?? now,
        admin_approved_by_name: meta.admin_approved_by_name ?? actorName,
      }
      orderPaymentStatus = "paid"
    } else if (decision === "reject") {
      nextMeta = {
        ...meta,
        payment_status: "rejected",
        payment_rejected_at: now,
        payment_rejected_reason: note ?? null,
      }
      orderPaymentStatus = "rejected"
    } else {
      nextMeta = {
        ...meta,
        payment_status: "clarification_requested",
        clarification_requested_at: now,
        clarification_note: note ?? null,
      }
      orderPaymentStatus = "clarification_requested"
    }

    await poModule.updatePurchaseOrders([{ id: po.id, metadata: nextMeta }])

    // Mirror onto the linked order metadata so the order-page widget stays
    // in sync, and (on approve) unblock the existing dispatch flow via
    // b2b_approved_at — the same flag /admin/orders/:id/b2b-approve sets.
    if (po.order_id) {
      try {
        const orderModule = req.scope.resolve(Modules.ORDER)
        const order = await orderModule.retrieveOrder(po.order_id)
        await orderModule.updateOrders([
          {
            id: po.order_id,
            metadata: {
              ...(order.metadata || {}),
              payment_status: orderPaymentStatus,
              ...(decision === "approve" ? { b2b_approved_at: (order.metadata as any)?.b2b_approved_at ?? now } : {}),
            },
          },
        ])
      } catch (mErr) {
        logger.warn(`[payment-verifications] order mirror failed: ${mErr instanceof Error ? mErr.message : mErr}`)
      }
    }

    return res.json({ ok: true, decision, payment_status: nextMeta.payment_status })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[payment-verifications/decide] failed", { po_id: poId, error: message })
    return res.status(500).json({ message: "Couldn't record the decision." })
  }
}
