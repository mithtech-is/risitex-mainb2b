import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Instant-push storefront cache-bust on product changes (RISITEX).
 *
 * The storefront ISR-caches product data (`/wholesale/p/[slug]` 120s, `/products`,
 * `/wholesale/*`, home featured — up to 1h). Without this, an admin edit or a
 * delete takes the full ISR window to show up. This subscriber pushes an
 * on-demand revalidation to the storefront the moment a product (or just a
 * variant price) changes, so live pages refresh within seconds.
 *
 * Subscribes to BOTH `product.*` and `product-variant.updated` because variant
 * price edits emit ONLY the variant event — the parent product event isn't
 * raised in that path.
 *
 * POSTs { handle } to the storefront's /api/revalidate. The storefront derives
 * the affected RISITEX paths/tags from the handle. On `product.deleted` the row
 * may be gone before we resolve it — then we fall back to busting the listings.
 *
 * Contract: never throws. A down storefront just means the ISR window applies.
 */
export default async function productRevalidateHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    const storefront = process.env.STOREFRONT_URL || "http://localhost:3000"
    const secret = process.env.REVALIDATE_SECRET
    if (!secret) {
      console.warn("[product-revalidate] REVALIDATE_SECRET missing — skipping")
      return
    }

    const eventName = (event?.name as string | undefined) || ""
    const isVariantEvent = eventName.startsWith("product-variant.")
    const entityId = event?.data?.id
    if (!entityId) return

    // Resolve the product handle. For product.* the id IS the product; for
    // product-variant.updated walk variant→product via the Query Graph.
    let handle: string | null = null
    try {
      if (isVariantEvent) {
        const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
        const { data } = await query.graph({
          entity: "variant",
          fields: ["id", "product.id", "product.handle"],
          filters: { id: entityId },
        })
        const variant = Array.isArray(data) ? data[0] : data
        handle = variant?.product?.handle ?? null
      } else {
        const productModule: any = container.resolve(Modules.PRODUCT)
        const [product] = await productModule.listProducts(
          { id: entityId },
          { take: 1, select: ["id", "handle"] },
        )
        handle = product?.handle ?? null
      }
    } catch {
      // product.deleted after the row is gone — fall back to listings below.
    }

    const body: Record<string, unknown> = handle
      ? { handle }
      : { tags: ["products"], paths: ["/", "/products", "/wholesale/catalogue"] }

    const res = await fetch(`${storefront}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn(
        `[product-revalidate] storefront returned ${res.status} for ${eventName} ${entityId}`,
      )
    }
  } catch (err: any) {
    console.warn("[product-revalidate] failed:", err?.message ?? err)
  }
}

export const config: SubscriberConfig = {
  event: [
    "product.created",
    "product.updated",
    "product.deleted",
    "product-variant.updated",
  ],
}
