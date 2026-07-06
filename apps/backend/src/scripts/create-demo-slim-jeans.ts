import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * VERIFICATION-ONLY: creates a published "Slim" Jeans product with a
 * thumbnail + gallery images, linked to the men-jeans-slim category and the
 * default sales channel — exactly what the admin does via the stock UI
 * (assign category → upload images → publish). Confirms the storefront then
 * places it automatically under Men → Bottom Wear → Jeans → Slim.
 *
 *   pnpm exec medusa exec ./src/scripts/create-demo-slim-jeans.ts
 */
export default async function run({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT) as any
  const scModule = container.resolve(Modules.SALES_CHANNEL) as any

  const handle = "demo-slim-jeans-indigo"
  const existing = await productModule.listProducts({ handle })
  if (existing?.length) {
    logger.info(`[demo] already exists: ${existing[0].id}`)
    return
  }

  const cats = await productModule.listProductCategories({
    handle: "men-jeans-slim",
  })
  const slimId = cats?.[0]?.id
  if (!slimId) {
    logger.error("[demo] men-jeans-slim category missing — run seed:categories first")
    return
  }

  const channels = await scModule.listSalesChannels({}, { take: 1 })
  const channelId = channels?.[0]?.id

  const created = await productModule.createProducts([
    {
      title: "Demo Slim Jeans — Indigo",
      handle,
      status: "published",
      description:
        "Mid-rise slim-fit jeans in 12oz indigo denim. Demo product created to verify category auto-placement + image flow.",
      thumbnail: "/demo/products/photo-05.jpg",
      images: [
        { url: "/demo/products/photo-05.jpg" },
        { url: "/demo/products/photo-08.jpg" },
        { url: "/demo/products/photo-12.jpg" },
      ],
      category_ids: [slimId],
      metadata: {
        category: "men",
        subcategory: "Jeans",
        fabric: "Denim",
        moq: 100,
        case_pack: 12,
      },
      options: [{ title: "Size", values: ["30", "32", "34", "36"] }],
      variants: [
        { title: "30", sku: "DSJ-IND-30", options: { Size: "30" } },
        { title: "32", sku: "DSJ-IND-32", options: { Size: "32" } },
        { title: "34", sku: "DSJ-IND-34", options: { Size: "34" } },
        { title: "36", sku: "DSJ-IND-36", options: { Size: "36" } },
      ],
      ...(channelId ? { sales_channels: [{ id: channelId }] } : {}),
    },
  ])
  const p = Array.isArray(created) ? created[0] : created
  logger.info(`[demo] created ${p.id} (${handle}) → men-jeans-slim, channel ${channelId ?? "none"}`)
}
