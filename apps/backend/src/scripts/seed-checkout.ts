import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * One-shot seed to give the storefront a working Medusa checkout target:
 *
 *   - Region IN (INR) + cashfree-wallet payment provider attached
 *     (Razorpay will be added in Phase 11.O)
 *   - Stock location "Erode HQ"
 *   - Sales channel — reuses the bootstrap default
 *   - Product "RISITEX storefront line item" with one ₹1 variant.
 *     /store/checkout/begin multiplies this variant's qty to match
 *     the storefront's Zustand cart total without having to mirror
 *     every fixture SKU as a real product.
 *
 * Idempotent — re-running is a no-op.
 *
 * Run with:
 *   pnpm exec medusa exec ./src/scripts/seed-checkout.ts
 *   (or `pnpm seed:checkout` if you added that alias)
 */
export default async function seedCheckout({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const regionService = container.resolve(Modules.REGION)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)
  const productService = container.resolve(Modules.PRODUCT)

  let region: { id: string } | null = null
  let stockLocation: { id: string } | null = null
  let salesChannel: { id: string } | null = null
  let product: { id: string } | null = null

  // ── Region ──────────────────────────────────────────────────────
  const existingRegions = await regionService.listRegions({
    currency_code: "inr",
  })
  if (existingRegions.length > 0) {
    region = existingRegions[0] ?? null
    logger.info(`[seed:checkout] reusing region ${region?.id}`)
  } else {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "India",
            currency_code: "inr",
            countries: ["in"],
            // Both rails on the region: wallet-only orders pick the
            // cashfree-wallet provider; bank-rail orders pick Razorpay.
            // Storefront sends provider_id via initiatePaymentSession.
            payment_providers: [
              "pp_cashfree-wallet_cashfree-wallet",
              "pp_razorpay_razorpay",
            ],
          },
        ],
      },
    })
    region = result[0] ?? null
    logger.info(`[seed:checkout] created region ${region?.id}`)
  }

  // ── Sales channel — reuse the bootstrap default ────────────────
  const sc = await salesChannelService.listSalesChannels({}, { take: 1 })
  if (sc.length > 0) {
    salesChannel = sc[0] ?? null
    logger.info(`[seed:checkout] reusing sales channel ${salesChannel?.id}`)
  } else {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "RISITEX storefront" }] },
    })
    salesChannel = result[0] ?? null
  }

  // ── Stock location ─────────────────────────────────────────────
  const sl = await stockLocationService.listStockLocations({}, { take: 1 })
  if (sl.length > 0) {
    stockLocation = sl[0] ?? null
    logger.info(`[seed:checkout] reusing stock location ${stockLocation?.id}`)
  } else {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Bangalore HQ",
            address: {
              address_1: "#48-34-10, 4th Floor, 1st Cross, Lalbagh Road",
              city: "Bangalore",
              province: "Karnataka",
              country_code: "in",
              postal_code: "560027",
            },
          },
        ],
      },
    })
    stockLocation = result[0] ?? null
    logger.info(`[seed:checkout] created stock location ${stockLocation?.id}`)
  }

  if (salesChannel && stockLocation) {
    try {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: stockLocation.id, add: [salesChannel.id] },
      })
    } catch (err) {
      logger.warn(
        `[seed:checkout] linkSalesChannelsToStockLocation: ${
          err instanceof Error ? err.message : err
        }`,
      )
    }
  }

  // ── Product + Variant ──────────────────────────────────────────
  const existingProducts = await productService.listProducts({
    handle: "risitex-storefront-line-item",
  })
  if (existingProducts.length > 0) {
    product = existingProducts[0] ?? null
    logger.info(`[seed:checkout] reusing product ${product?.id}`)
  } else {
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "RISITEX storefront line item",
            handle: "risitex-storefront-line-item",
            status: "published" as const,
            sales_channels: salesChannel ? [{ id: salesChannel.id }] : [],
            options: [{ title: "Size", values: ["one"] }],
            variants: [
              {
                title: "₹1 unit",
                sku: "RISITEX-CHECKOUT-1P",
                options: { Size: "one" },
                manage_inventory: false,
                prices: [{ amount: 100, currency_code: "inr" }], // ₹1
              },
            ],
          },
        ],
      },
    })
    product = result[0] ?? null
    logger.info(`[seed:checkout] created product ${product?.id}`)
  }

  logger.info(
    `[seed:checkout] DONE region=${region?.id} sc=${salesChannel?.id} stock=${stockLocation?.id} product=${product?.id}`,
  )
}
