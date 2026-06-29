import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/core-flows"

/**
 * Shared cart-add primitives for wholesale ordering (FR-3.01 / 3.02 / 3.04).
 * Matrix grid, master-carton ratio, and quick-reorder all reduce to "add a
 * computed set of {variant_id, quantity} to a cart".
 */

type Container = { resolve: (k: string) => any }
export type CartLineInput = { variant_id: string; quantity: number }

/** Batch-add line items to a cart via the native add-to-cart workflow. */
export async function addItemsToCart(
  container: Container,
  cartId: string,
  items: CartLineInput[],
): Promise<{ added_units: number; added_lines: number }> {
  const clean = (items ?? [])
    .filter((i) => i.variant_id && Number(i.quantity) > 0)
    .map((i) => ({ variant_id: i.variant_id, quantity: Number(i.quantity) }))
  if (!clean.length) return { added_units: 0, added_lines: 0 }

  await addToCartWorkflow(container as any).run({
    input: { cart_id: cartId, items: clean } as any,
  })
  return {
    added_units: clean.reduce((s, i) => s + i.quantity, 0),
    added_lines: clean.length,
  }
}

/**
 * Build a lowercased lookup of {size value | variant title} → variant_id for a
 * product, so size-keyed grids/ratios (S, M, L, …) resolve to variants.
 */
export async function resolveSizeVariants(
  container: Container,
  productId: string,
): Promise<{ map: Record<string, string>; variantIds: string[] }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "variants.id",
      "variants.title",
      "variants.options.value",
      "variants.options.option.title",
    ],
    filters: { id: productId },
  })
  const variants: any[] = products?.[0]?.variants ?? []
  const map: Record<string, string> = {}
  for (const v of variants) {
    const sizeOpt = (v.options ?? []).find(
      (o: any) => (o?.option?.title ?? "").toLowerCase() === "size",
    )
    if (sizeOpt?.value) map[String(sizeOpt.value).toLowerCase()] = v.id
    if (v.title) map[String(v.title).toLowerCase()] = v.id
  }
  return { map, variantIds: variants.map((v) => v.id) }
}

/**
 * Resolve a {key: qty} grid/ratio into cart line inputs. A key is used directly
 * when it's a variant id (`variant_*`), else looked up by size/title.
 */
export function resolveGridToItems(
  grid: Record<string, unknown>,
  sizeMap: Record<string, string>,
  multiplier = 1,
): CartLineInput[] {
  const items: CartLineInput[] = []
  for (const [key, qtyRaw] of Object.entries(grid ?? {})) {
    const qty = Number(qtyRaw) * (Number(multiplier) || 1)
    if (!qty || qty <= 0) continue
    const variantId =
      typeof key === "string" && key.startsWith("variant_")
        ? key
        : sizeMap[String(key).toLowerCase()] ?? null
    if (variantId) items.push({ variant_id: variantId, quantity: qty })
  }
  return items
}
