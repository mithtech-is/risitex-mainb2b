import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { B2B_PRICING_MODULE } from "../../../../../../modules/b2b_pricing"
import { resolveB2BContext } from "../../../../../../lib/b2b-tier"

/**
 * GET /store/b2b-sales/products/:id/pricing
 *
 * The single endpoint the storefront PDP calls to render B2B pricing for a
 * product. Resolves the caller's tier (per-customer override → company
 * default; guests get the default ladder) and returns:
 *
 *   {
 *     product_id,
 *     tier: { id, code, name } | null,
 *     price_tiers: [{ min_quantity, max_quantity, value, is_percentage }],
 *     quantity_rule: { min_qty, max_qty, step_qty } | null,
 *     visible: boolean
 *   }
 *
 * Auth is optional (allowUnauthenticated in middlewares) so guests can see
 * the public ladder while signed-in B2B buyers get their tier ladder.
 * `?region_id=` optionally narrows to a region-specific ladder.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id
  const customerId =
    (req as any).auth_context?.app_metadata?.customer_id ?? null

  const ctx = await resolveB2BContext(req.scope, customerId)

  // Resolve the product's categories for category-scoped tiers/visibility.
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "categories.id"],
    filters: { id: productId },
  })
  if (!products?.length) {
    return res.status(404).json({ message: "Product not found" })
  }
  const categoryIds: string[] = (products[0]?.categories ?? [])
    .map((c: any) => c?.id)
    .filter(Boolean)

  const regionId = (req.query.region_id as string) || null

  const svc = req.scope.resolve(B2B_PRICING_MODULE) as any
  const [priceTiers, quantityRule, visible] = await Promise.all([
    svc.getPriceTiers(productId, {
      tier_ids: ctx.tierIds,
      region_id: regionId,
      category_ids: categoryIds,
    }),
    svc.resolveQuantityRule(productId, ctx.tierIds),
    svc.isProductVisible(productId, categoryIds, ctx.audience),
  ])

  return res.json({
    product_id: productId,
    tier: ctx.tier,
    price_tiers: (priceTiers ?? []).map((t: any) => ({
      min_quantity: t.min_quantity,
      max_quantity: t.max_quantity,
      value: t.value,
      is_percentage: t.is_percentage,
    })),
    quantity_rule: quantityRule
      ? {
          min_qty: quantityRule.min_qty,
          max_qty: quantityRule.max_qty,
          step_qty: quantityRule.step_qty,
        }
      : null,
    visible,
  })
}
