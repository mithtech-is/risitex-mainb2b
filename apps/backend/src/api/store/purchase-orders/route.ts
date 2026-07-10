import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
  QueryContext,
} from "@medusajs/framework/utils"
import { z } from "zod"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../modules/purchase_order"
import { logger } from "../../../utils/logger"

/**
 * GET /store/purchase-orders
 *
 * Customer-scoped list of PO documents the MBO has uploaded at
 * checkout (FR-4.03). Status is DERIVED from the linked Medusa order,
 * since the PurchaseOrder model itself has no status column:
 *
 *   - "draft"        : no order_id yet (PO uploaded, checkout still
 *                      in flight or cart abandoned)
 *   - "in_progress"  : order exists, fulfillment_status NOT "delivered"
 *                      and order.status NOT "canceled"
 *   - "fulfilled"    : order's fulfillment_status === "delivered"
 *   - "cancelled"    : underlying order is canceled
 *
 * Each row carries:
 *   - id, po_number, file_url
 *   - value_major (= value_minor / 100)
 *   - expected_payment_date, created_at
 *   - order: { id, display_id, status, payment_status, fulfillment_status }
 *     (null when status === "draft")
 *   - status (derived per the above)
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata
    ?.customer_id as string | undefined
  if (!customerId) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  try {
    const poModule = req.scope.resolve(
      PURCHASE_ORDER_MODULE,
    ) as PurchaseOrderModuleService

    const [rows] = await (
      poModule as unknown as {
        listAndCountPurchaseOrders: (
          filters: Record<string, unknown>,
          config?: { take?: number; order?: Record<string, "ASC" | "DESC"> },
        ) => Promise<[any[], number]>
      }
    ).listAndCountPurchaseOrders(
      { customer_id: customerId },
      { take: 200, order: { created_at: "DESC" } },
    )

    // Resolve the linked Medusa orders in one shot to derive status.
    const orderIds = (rows as Array<{ order_id: string | null }>)
      .map((r) => r.order_id)
      .filter((id): id is string => !!id)
    const orderById = new Map<
      string,
      {
        id: string
        display_id: number | string
        status: string | null
        payment_status: string | null
        fulfillment_status: string | null
      }
    >()
    if (orderIds.length > 0) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: orders } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "status",
          "payment_status",
          "fulfillment_status",
        ],
        filters: { id: orderIds },
      })
      for (const o of orders ?? []) {
        orderById.set(o.id, o)
      }
    }

    const items = (rows as any[]).map((r) => {
      const linkedOrder = r.order_id ? orderById.get(r.order_id) ?? null : null
      let status: "draft" | "in_progress" | "fulfilled" | "cancelled"
      if (!linkedOrder) {
        status = "draft"
      } else if (linkedOrder.status === "canceled") {
        status = "cancelled"
      } else if (linkedOrder.fulfillment_status === "delivered") {
        status = "fulfilled"
      } else {
        status = "in_progress"
      }
      // Buyer-side payment-confirmation flags live in metadata (see
      // /confirm-payment route). Surface them on the list so the storefront
      // doesn't need a second round-trip per row to render the badge.
      const meta = (r.metadata ?? {}) as Record<string, unknown>
      const pickStr = (key: string): string | null =>
        typeof meta[key] === "string" ? (meta[key] as string) : null
      const payment_confirmed_at = pickStr("payment_confirmed_at")
      const payment_confirmed_method = pickStr("payment_confirmed_method")
      const payment_confirmed_reference = pickStr("payment_confirmed_reference")
      // Admin-side promotion flags — set by /admin/purchase-orders/:id/approve-payment
      // and /mark-shipped. Storefront uses these to flip shipment + invoice
      // tabs from "queued" to live tracking once admin has acted.
      const admin_approved_at = pickStr("admin_approved_at")
      const admin_approved_by_name = pickStr("admin_approved_by_name")
      const dispatched_at = pickStr("dispatched_at")
      const dispatch_tracking_number = pickStr("dispatch_tracking_number")
      const dispatch_carrier = pickStr("dispatch_carrier")
      return {
        id: r.id,
        po_number: r.po_number,
        file_url: r.file_url,
        value_major: Math.round(Number(r.value_minor ?? 0) / 100),
        currency_code: r.currency_code ?? "inr",
        expected_payment_date: r.expected_payment_date,
        created_at: r.created_at,
        updated_at: r.updated_at,
        order: linkedOrder,
        status,
        payment_confirmed_at,
        payment_confirmed_method,
        payment_confirmed_reference,
        admin_approved_at,
        admin_approved_by_name,
        dispatched_at,
        dispatch_tracking_number,
        dispatch_carrier,
        metadata: meta,
      }
    })

    return res.json({ purchase_orders: items })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/purchase-orders] list failed", {
      customer_id: customerId,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't load purchase orders.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}

/**
 * POST /store/purchase-orders
 *
 * Body: { po_number, file_url, value_major, expected_payment_date?, notes? }
 *
 * Creates a new purchase_order document in DRAFT state.
 *
 * We resolve the customer's active company_id at create time so the PO
 * attribution survives even if the customer later moves to a
 * different team.
 */

const AddressSchema = z.object({
  address_1: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  country_code: z.string().optional().nullable(),
})

const PostBody = z.object({
  po_number: z.string().min(1).max(60),
  file_url: z.string().url().or(z.string().startsWith("/")),
  value_major: z.number().int().positive().max(100_000_000),
  expected_payment_date: z.string().datetime().optional(),
  notes: z.string().max(2_000).optional(),
  items: z.array(z.object({
    variant_id: z.string(),
    quantity: z.number().int().positive(),
  })).optional(),
  billing_address: AddressSchema.optional(),
  shipping_address: AddressSchema.optional(),
})

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
  const input = parsed.data

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    // Resolve company_id and email so PO attribution is durable even if the
    // customer later moves between teams.
    let companyId: string | null = null
    let customerEmail: string | null = null
    try {
      const { data: customers } = await query.graph({
        entity: "customer",
        fields: ["id", "company_id", "email"],
        filters: { id: customerId },
      })
      companyId = (customers?.[0]?.company_id as string | null) ?? null
      customerEmail = (customers?.[0]?.email as string | null) ?? null
    } catch {
      // ignore — company_id and email are best-effort
    }

    // Resolve Region and Sales Channel
    let regionId: string | null = null
    try {
      const regionService = req.scope.resolve(Modules.REGION)
      const regions = await regionService.listRegions({ currency_code: "inr" }, { take: 1 })
      regionId = regions[0]?.id ?? null
    } catch {
      // ignore
    }

    let salesChannelId: string | null = null
    try {
      const scService = req.scope.resolve(Modules.SALES_CHANNEL)
      const scs = await scService.listSalesChannels({}, { take: 1 })
      salesChannelId = scs[0]?.id ?? null
    } catch {
      // ignore
    }

    let orderId: string | null = null
    if (input.items && input.items.length > 0) {
      try {
        const variantIds = input.items.map((it) => it.variant_id)
        // calculated_price needs a pricing context (currency / region),
        // otherwise the pricing module throws "calculatePrices requires
        // currency_code in the pricing context" and no native order is created.
        const { data: variants } = await query.graph({
          entity: "variant",
          fields: ["id", "title", "sku", "product.title", "calculated_price.calculated_amount"],
          filters: { id: variantIds },
          context: {
            calculated_price: QueryContext({
              currency_code: "inr",
              ...(regionId ? { region_id: regionId } : {}),
            }),
          },
        })

        const orderItems = input.items.map((item) => {
          const v = variants.find((x) => x.id === item.variant_id)
          const price = v?.calculated_price?.calculated_amount ?? 100
          return {
            title: v?.product?.title || v?.title || "Line item",
            variant_id: item.variant_id,
            sku: v?.sku || "",
            quantity: item.quantity,
            unit_price: price, // in minor units
          }
        })

        const orderModule = req.scope.resolve(Modules.ORDER)
        const createdOrder = await orderModule.createOrders({
          region_id: regionId || undefined,
          customer_id: customerId,
          sales_channel_id: salesChannelId || undefined,
          email: customerEmail || undefined,
          currency_code: "inr",
          status: "pending",
          shipping_address: input.shipping_address ? {
            address_1: input.shipping_address.address_1 || "",
            city: input.shipping_address.city || "",
            province: input.shipping_address.province || "",
            postal_code: input.shipping_address.postal_code || "",
            country_code: input.shipping_address.country_code || "in",
          } : undefined,
          billing_address: input.billing_address ? {
            address_1: input.billing_address.address_1 || "",
            city: input.billing_address.city || "",
            province: input.billing_address.province || "",
            postal_code: input.billing_address.postal_code || "",
            country_code: input.billing_address.country_code || "in",
          } : undefined,
          items: orderItems,
          shipping_methods: [
            {
              name: "Standard B2B Shipping",
              amount: 0,
            }
          ]
        })
        orderId = createdOrder.id
      } catch (orderErr) {
        logger.warn(
          `[purchase-orders] failed to create standard Medusa Order: ${orderErr instanceof Error ? orderErr.message : orderErr}`
        )
      }
    }

    const poModule = req.scope.resolve(
      PURCHASE_ORDER_MODULE,
    ) as PurchaseOrderModuleService
    const created = await (
      poModule as unknown as {
        createPurchaseOrders: (
          input: Record<string, unknown>,
        ) => Promise<any | any[]>
      }
    ).createPurchaseOrders({
      customer_id: customerId,
      company_id: companyId,
      order_id: orderId,
      po_number: input.po_number.trim(),
      file_url: input.file_url,
      value_minor: input.value_major * 100,
      currency_code: "inr",
      expected_payment_date: input.expected_payment_date
        ? new Date(input.expected_payment_date)
        : null,
      metadata: input.notes ? { notes: input.notes } : null,
    })
    const row = Array.isArray(created) ? created[0] : created

    let linkedOrder = null
    if (orderId) {
      try {
        const { data: orders } = await query.graph({
          entity: "order",
          fields: ["id", "display_id", "status", "payment_status", "fulfillment_status"],
          filters: { id: orderId },
        })
        linkedOrder = orders?.[0] ?? null
      } catch {
        // ignore
      }
    }

    return res.status(201).json({
      purchase_order: {
        id: row.id,
        po_number: row.po_number,
        file_url: row.file_url,
        value_major: Math.round(Number(row.value_minor ?? 0) / 100),
        currency_code: row.currency_code ?? "inr",
        expected_payment_date: row.expected_payment_date,
        created_at: row.created_at,
        updated_at: row.updated_at,
        order: linkedOrder,
        status: linkedOrder ? "in_progress" : "draft",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[store/purchase-orders] create failed", {
      customer_id: customerId,
      error: message,
    })
    return res.status(500).json({
      message: "Couldn't save the purchase order.",
      detail: process.env.NODE_ENV !== "production" ? message : undefined,
    })
  }
}
