import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Seed the initial PIX catalog so the storefront /products pages and
 * /store/products return real data.
 *
 * Five products covering the PIX line per FR-2.02:
 *   - Woven Inner Boxer (S–XXL)
 *   - Boxer Shorts (S–XXL)
 *   - Lounge Shorts (S–XXL)
 *   - Pyjama (S–XXL)
 *   - Pyjama Set (M–XXL — sized by torso for the matching top)
 *
 * Each variant carries:
 *   - INR wholesale base price; tier-aware price lists land in
 *     a follow-up seed that joins to customer_tier)
 *   - HSN code in metadata (61071100 for cotton men's underwear,
 *     61071900 for other men's underwear, 61071200 for cotton men's
 *     nightwear) — Phase 11 GST math reads this off the variant
 *   - Size in options
 *   - manage_inventory: false  (so a missing stock_location record
 *     doesn't block carts during dev; flip to true once a real
 *     inventory level is set per warehouse)
 *
 * Idempotent — products are looked up by handle; re-running upserts
 * are skipped if the handle already exists.
 *
 * Run with:
 *   pnpm exec medusa exec ./src/scripts/seed-pix-catalog.ts
 */

type ProductDef = {
  title: string
  handle: string
  description: string
  category: "innerwear" | "loungewear"
  hsn_code: string
  gsm: number
  sizes: string[]
  /** Per-variant INR price in paise. Plain object — all sizes price
   *  the same by default; B2B tier price lists override per-tier. */
  unit_price_paise: number
  sku_prefix: string
}

const PRODUCTS: ProductDef[] = [
  {
    title: "PIX Woven Inner Boxer",
    handle: "pix-woven-inner-boxer",
    description:
      "100% combed cotton woven inner boxer. Engineered for hygiene, crafted for comfort. Elastic waistband with PIX branding, four-way stretch panels at the seat.",
    category: "innerwear",
    hsn_code: "61071100",
    gsm: 110,
    sizes: ["S", "M", "L", "XL", "XXL"],
    unit_price_paise: 19900, // Rs 199 / unit base wholesale price
    sku_prefix: "PIX-WIB",
  },
  {
    title: "PIX Boxer Shorts",
    handle: "pix-boxer-shorts",
    description:
      "Mid-rise boxer shorts in soft-handle cotton-modal blend. Side pockets, drawstring closure. The everyday loungewear staple.",
    category: "loungewear",
    hsn_code: "61071900",
    gsm: 145,
    sizes: ["S", "M", "L", "XL", "XXL"],
    unit_price_paise: 39900,
    sku_prefix: "PIX-BS",
  },
  {
    title: "PIX Lounge Shorts",
    handle: "pix-lounge-shorts",
    description:
      "Knee-length lounge shorts. French-terry cotton, breathable for long wear. Two side pockets, elasticated waist with internal drawcord.",
    category: "loungewear",
    hsn_code: "61071900",
    gsm: 220,
    sizes: ["S", "M", "L", "XL", "XXL"],
    unit_price_paise: 49900,
    sku_prefix: "PIX-LS",
  },
  {
    title: "PIX Pyjama",
    handle: "pix-pyjama",
    description:
      "Lightweight cotton pyjama bottoms. Tapered fit, elasticated waistband, single back pocket. Wash 100+ times without losing shape.",
    category: "loungewear",
    hsn_code: "61071200",
    gsm: 130,
    sizes: ["S", "M", "L", "XL", "XXL"],
    unit_price_paise: 59900,
    sku_prefix: "PIX-PJ",
  },
  {
    title: "PIX Pyjama Set",
    handle: "pix-pyjama-set",
    description:
      "Matching pyjama top + bottom in coordinated cotton. Top has notch lapel collar, two-button placket; bottom is the PIX Pyjama with the same fit and finish.",
    category: "loungewear",
    hsn_code: "61071200",
    gsm: 130,
    sizes: ["M", "L", "XL", "XXL"],
    unit_price_paise: 119900,
    sku_prefix: "PIX-PJS",
  },
]

export default async function seedPixCatalog({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)

  // Default sales channel is what the publishable key is linked to
  // (Phase 11.A). Without attaching products to a SC, /store/products
  // returns an empty array for that key.
  const channels = await salesChannelService.listSalesChannels({}, { take: 1 })
  const channelId = channels[0]?.id
  if (!channelId) {
    logger.error(
      "[seed:catalog] No sales channel found — run seed-checkout.ts first.",
    )
    return
  }

  for (const def of PRODUCTS) {
    const existing = await productService.listProducts({ handle: def.handle })
    if (existing.length > 0) {
      logger.info(
        `[seed:catalog] reusing ${def.handle} (${existing[0]!.id})`,
      )
      continue
    }
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: def.title,
            handle: def.handle,
            description: def.description,
            status: "published" as const,
            sales_channels: [{ id: channelId }],
            metadata: {
              category: def.category,
              hsn_code: def.hsn_code,
              gsm: def.gsm,
            },
            options: [
              { title: "Size", values: def.sizes },
            ],
            variants: def.sizes.map((size) => ({
              title: `${def.title} — ${size}`,
              sku: `${def.sku_prefix}-${size}`,
              options: { Size: size },
              manage_inventory: false,
              metadata: {
                size,
                hsn_code: def.hsn_code,
              },
              prices: [
                {
                  amount: def.unit_price_paise,
                  currency_code: "inr",
                },
              ],
            })),
          },
        ],
      },
    })
    const created = result[0]
    logger.info(
      `[seed:catalog] created ${def.handle} (${created?.id}) — ${def.sizes.length} variants`,
    )
  }

  const all = await productService.listProducts(
    {},
    { take: 100, relations: ["variants"] },
  )
  logger.info(`[seed:catalog] DONE — catalog has ${all.length} products`)
}
