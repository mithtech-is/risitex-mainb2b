import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { verifyRazorpayWebhookSignature } from "../../../lib/razorpay"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../modules/purchase_order"
import { logger } from "../../../utils/logger"

/**
 * POST /webhooks/razorpay
 *
 * Razorpay webhook receiver. Reconciles payment/refund events against
 * the Medusa order that initiated them and mirrors the result onto
 * the linked purchase_order.
 *
 * This is a backstop, not the primary reconciliation path —
 * `POST /store/purchase-orders` (see its `payment.method === "razorpay"`
 * branch) already verifies the signature triple synchronously and
 * stamps `metadata.payment_status: "paid"` + `metadata.razorpay_order_id`
 * / `metadata.razorpay_payment_id` on both the order and the PO the
 * moment the buyer's browser returns from Razorpay Checkout. This
 * webhook exists to catch the cases where that never happens (browser
 * closed mid-flow, network drop) and to record refunds, which have no
 * synchronous browser-side callback at all. Because the synchronous
 * path usually wins the race, the idempotency check below (skip if
 * `payment_status` is already the target value) is the common case,
 * not an edge case.
 *
 * Raw body handling mirrors `api/webhooks/cashfree/payment-gateway/route.ts`
 * exactly:
 *
 *   const rawBody =
 *     (req as any).rawBody !== undefined
 *       ? (req as any).rawBody
 *       : JSON.stringify(req.body ?? {})
 *
 * `req.rawBody` is populated because `api/middlewares.ts` registers
 * `{ matcher: "/webhooks/*", method: ["POST"], bodyParser: { preserveRawBody: true } }`
 * — re-serialised JSON would reorder keys/whitespace and break the
 * HMAC, so the exact posted bytes have to survive to this handler.
 *
 * Security: HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET) verified via
 * `verifyRazorpayWebhookSignature` (see lib/razorpay.ts). Unlike the
 * checkout signature triple, a webhook POST can be forged by anyone
 * who knows the URL, so — unlike lib/razorpay's other verify function —
 * there is NO dev pass-through here: no secret configured means the
 * verifier returns `false` and this route 401s. That is correct
 * behaviour, not a bug to work around.
 *
 * Response codes: 401 ONLY for a signature that fails verification.
 * Every other outcome (unrecognised event, no matching order,
 * idempotent replay, internal error) responds 200 — Razorpay retries
 * aggressively on non-2xx and none of those cases benefit from a
 * retry storm.
 */

// Event → target `metadata.payment_status` on the linked order.
// Events not listed here fall through to the "unrecognised" 200
// branch. "paid" mirrors the exact string
// POST /store/purchase-orders already writes on synchronous Razorpay
// verification (see that route's `payment_status: "paid"`).
const EVENT_STATUS_MAP: Record<string, string> = {
  "payment.captured": "paid",
  "payment.authorized": "paid",
  "order.paid": "paid",
  "payment.failed": "failed",
  "refund.created": "refund_initiated",
  "refund.processed": "refunded",
}

type RazorpayWebhookBody = {
  event?: string
  payload?: {
    payment?: {
      entity?: {
        id?: string
        order_id?: string
        status?: string
        amount?: number
      }
    }
    refund?: {
      entity?: {
        id?: string
        payment_id?: string
        status?: string
        amount?: number
      }
    }
    order?: {
      entity?: {
        id?: string
        status?: string
        amount_paid?: number
      }
    }
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  // ── Raw body + signature verification (must happen BEFORE the
  // try/catch below, so a signature failure always reaches the caller
  // as 401 and is never swallowed by the catch-all 200). ──────────
  const rawBody =
    (req as any).rawBody !== undefined
      ? (req as any).rawBody
      : JSON.stringify(req.body ?? {})
  const rawBodyStr =
    typeof rawBody === "string"
      ? rawBody
      : (rawBody as Buffer | undefined)?.toString("utf8") ?? ""

  const sigHeaderRaw = req.headers["x-razorpay-signature"]
  const sigHeader = Array.isArray(sigHeaderRaw) ? sigHeaderRaw[0] : sigHeaderRaw

  const verified = verifyRazorpayWebhookSignature(rawBodyStr, sigHeader)
  if (!verified) {
    logger.warn("razorpay webhook: signature verification failed", {
      has_signature: !!sigHeader,
      body_size: rawBodyStr.length,
    })
    return res.status(401).json({ message: "invalid signature" })
  }

  try {
    const body: RazorpayWebhookBody =
      safeParseJson(rawBodyStr) ||
      ((req.body as RazorpayWebhookBody | undefined) ?? {})
    const event = String(body.event ?? "")
    const payloadBlock = body.payload ?? {}

    const targetStatus = EVENT_STATUS_MAP[event]
    if (!targetStatus) {
      return res.status(200).json({ received: true, ignored: event })
    }

    const payment = payloadBlock.payment?.entity
    const refund = payloadBlock.refund?.entity
    const orderEntity = payloadBlock.order?.entity
    const razorpayOrderId = payment?.order_id ?? orderEntity?.id ?? undefined
    const razorpayPaymentId = payment?.id ?? refund?.payment_id ?? undefined

    if (!razorpayOrderId && !razorpayPaymentId) {
      logger.warn(
        "razorpay webhook: event carries no order/payment id to reconcile against",
        { event },
      )
      return res.status(200).json({ received: true, matched: false })
    }

    // Reconciliation lookup — same technique as
    // admin/payment-verifications/route.ts: fetch a bounded batch of
    // orders and filter in JS for the metadata match (there's no
    // native filter-by-metadata-field on the order entity). The
    // fields we match on (`razorpay_order_id` / `razorpay_payment_id`)
    // are the exact keys POST /store/purchase-orders already stamps
    // onto order metadata on synchronous verification.
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "metadata"],
      pagination: { take: 500 },
    })

    const matched = (orders ?? []).find((o: any) => {
      const m = (o.metadata ?? {}) as Record<string, unknown>
      return (
        (!!razorpayOrderId && m.razorpay_order_id === razorpayOrderId) ||
        (!!razorpayPaymentId && m.razorpay_payment_id === razorpayPaymentId)
      )
    }) as { id: string; metadata?: Record<string, unknown> } | undefined

    if (!matched) {
      // The synchronous verify path likely already handled this
      // payment, or the order metadata simply doesn't carry a
      // razorpay_order_id yet (e.g. dev pass-through). Either way,
      // Razorpay must get a 200 or it retry-storms us.
      logger.warn("razorpay webhook: no order matched event identifiers", {
        event,
        razorpay_order_id: razorpayOrderId ?? null,
        razorpay_payment_id: razorpayPaymentId ?? null,
      })
      return res.status(200).json({ received: true, matched: false })
    }

    const existingMeta = (matched.metadata ?? {}) as Record<string, unknown>
    if (existingMeta.payment_status === targetStatus) {
      // Natural no-op — most deliveries land here because the
      // synchronous verify path already set this exact status.
      return res.status(200).json({ received: true, idempotent: true })
    }

    const orderModule = req.scope.resolve(Modules.ORDER)
    await orderModule.updateOrders([
      {
        id: matched.id,
        metadata: {
          ...existingMeta,
          payment_status: targetStatus,
          razorpay_webhook_event: event,
          razorpay_webhook_at: new Date().toISOString(),
        },
      },
    ])

    // Best-effort: mirror the same payment_status onto the linked
    // purchase_order (if any) so PO tracking views stay in sync.
    // Failure here must never fail the webhook — the order itself is
    // already updated.
    try {
      const poModule = req.scope.resolve(
        PURCHASE_ORDER_MODULE,
      ) as PurchaseOrderModuleService
      const pos = await (
        poModule as unknown as {
          listPurchaseOrders: (
            filters: Record<string, unknown>,
          ) => Promise<any[]>
        }
      ).listPurchaseOrders({ order_id: matched.id })
      const po = pos?.[0]
      if (po) {
        const poMeta = (po.metadata ?? {}) as Record<string, unknown>
        await (
          poModule as unknown as {
            updatePurchaseOrders: (
              rows: Array<Record<string, unknown>>,
            ) => Promise<any>
          }
        ).updatePurchaseOrders([
          {
            id: po.id,
            metadata: { ...poMeta, payment_status: targetStatus },
          },
        ])
      }
    } catch (poErr) {
      logger.warn(
        "razorpay webhook: failed to mirror payment_status onto linked PO",
        {
          order_id: matched.id,
          error: poErr instanceof Error ? poErr.message : String(poErr),
        },
      )
    }

    logger.info("razorpay webhook: order payment_status updated", {
      order_id: matched.id,
      event,
      payment_status: targetStatus,
    })

    return res.status(200).json({
      received: true,
      updated: true,
      order_id: matched.id,
      payment_status: targetStatus,
    })
  } catch (err) {
    logger.error("razorpay webhook: processing failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    // Webhooks: swallow internal errors as 200 (logged above) so
    // Razorpay doesn't retry-storm us over a transient DB/lookup
    // failure. Only a signature failure (handled above, BEFORE this
    // try/catch) returns non-200.
    return res.status(200).json({ received: true })
  }
}

function safeParseJson(s: string): RazorpayWebhookBody | null {
  try {
    return JSON.parse(s) as RazorpayWebhookBody
  } catch {
    return null
  }
}
