import {
  ContainerRegistrationKeys,
  Modules,
  QueryContext,
} from "@medusajs/framework/utils"
import { PURCHASE_ORDER_MODULE } from "../modules/purchase_order"

/**
 * Backfill native Medusa Orders for purchase_orders that never got one.
 *
 * Historically the checkout tried to create a native order at PO time, but the
 * variant-price lookup threw ("calculatePrices requires currency_code") so the
 * order creation was swallowed and the PO ended up with order_id = null — i.e.
 * the admin Orders module stayed empty. The route is now fixed for NEW orders;
 * this one-off backfills the EXISTING order-less POs so they appear too.
 *
 * Existing POs don't store their line items, so each backfilled order carries a
 * single summary line valued at the PO total (customer + value are accurate).
 * Idempotent: only touches POs with order_id = null.
 *
 * Run:  medusa exec ./src/scripts/backfill-po-orders.ts
 */
export default async function backfillPoOrders({
  container,
}: {
  container: any
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const orderModule = container.resolve(Modules.ORDER)
  const poModule = container.resolve(PURCHASE_ORDER_MODULE)

  const regionService = container.resolve(Modules.REGION)
  const regions = await regionService.listRegions(
    { currency_code: "inr" },
    { take: 1 },
  )
  const regionId = regions[0]?.id
  const scService = container.resolve(Modules.SALES_CHANNEL)
  const scs = await scService.listSalesChannels({}, { take: 1 })
  const salesChannelId = scs[0]?.id
  logger.info(
    `[backfill] region=${regionId ?? "none"} salesChannel=${salesChannelId ?? "none"}`,
  )

  // Sanity-check the pricing context that used to throw in the route.
  try {
    const { data: sample } = await query.graph({
      entity: "variant",
      fields: ["id", "calculated_price.calculated_amount"],
      pagination: { take: 1 },
      context: {
        calculated_price: QueryContext({
          currency_code: "inr",
          ...(regionId ? { region_id: regionId } : {}),
        }),
      },
    } as any)
    logger.info(
      `[backfill] price-context OK; sample amount=${sample?.[0]?.calculated_price?.calculated_amount ?? "n/a"}`,
    )
  } catch (e: any) {
    logger.error(`[backfill] price-context FAILED: ${e?.message ?? e}`)
  }

  const [pos] = await poModule.listAndCountPurchaseOrders(
    { order_id: null },
    { take: 500, order: { created_at: "ASC" } },
  )
  logger.info(`[backfill] ${pos.length} PO(s) without a native order`)

  let ok = 0
  let fail = 0
  for (const po of pos) {
    try {
      let email: string | undefined
      try {
        const { data: customers } = await query.graph({
          entity: "customer",
          fields: ["id", "email"],
          filters: { id: po.customer_id },
        })
        email = customers?.[0]?.email ?? undefined
      } catch {
        /* email best-effort */
      }
      const valueMajor = Math.max(1, Math.round(Number(po.value_minor ?? 0) / 100))
      const created: any = await orderModule.createOrders({
        region_id: regionId || undefined,
        customer_id: po.customer_id || undefined,
        sales_channel_id: salesChannelId || undefined,
        email: email || undefined,
        currency_code: "inr",
        status: "pending",
        metadata: { po_number: po.po_number, backfilled: true },
        items: [
          {
            title: `Purchase order ${po.po_number}`,
            quantity: 1,
            unit_price: valueMajor,
          },
        ],
        shipping_methods: [{ name: "Standard B2B Shipping", amount: 0 }],
      })
      await poModule.updatePurchaseOrders({ id: po.id, order_id: created.id })
      logger.info(
        `[backfill] PO ${po.po_number} -> order ${created.id} display#${created.display_id ?? "?"}`,
      )
      ok++
    } catch (e: any) {
      logger.error(`[backfill] PO ${po.po_number} FAILED: ${e?.message ?? e}`)
      fail++
    }
  }
  logger.info(`[backfill] done: ${ok} created, ${fail} failed`)
}
