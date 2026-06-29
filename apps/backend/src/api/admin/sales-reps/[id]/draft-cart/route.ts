import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createCartWorkflow } from "@medusajs/core-flows"
import { SALES_PERFORMANCE_MODULE } from "../../../../../modules/sales_performance"

/**
 * POST /admin/sales-reps/:id/draft-cart   (FR-1.04 Rep Impersonation)
 *
 * Body: { customer_id, region_id, items?: [{variant_id, quantity}], email? }
 *
 * Lets an internal rep draft a restocking cart ON BEHALF of a client. The
 * cart is owned by the customer and tagged `metadata.placed_by_rep_id` so a
 * resulting order attributes commission to the rep (FR-8.02). Returns the
 * cart id for the rep to review / complete.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const repId = req.params.id
  const { customer_id, region_id, items, email } = (req.body ?? {}) as {
    customer_id?: string
    region_id?: string
    items?: { variant_id?: string; quantity?: number }[]
    email?: string
  }
  if (!customer_id || !region_id) {
    return res
      .status(400)
      .json({ message: "customer_id and region_id are required" })
  }

  const salesPerf = req.scope.resolve<any>(SALES_PERFORMANCE_MODULE)
  const rep = await salesPerf.retrieveSalesRep(repId).catch(() => null)
  if (!rep) return res.status(404).json({ message: "Sales rep not found" })
  if (!rep.active) {
    return res.status(409).json({ message: "Sales rep is inactive" })
  }

  // Resolve the customer's email (carts need one for checkout) if not given.
  let custEmail = email
  if (!custEmail) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "customer",
      fields: ["id", "email"],
      filters: { id: customer_id },
    })
    custEmail = (data?.[0] as any)?.email
  }

  const lineItems = Array.isArray(items)
    ? items
        .map((i) => ({
          variant_id: i.variant_id as string,
          quantity: Number(i.quantity),
        }))
        .filter((i) => i.variant_id && i.quantity > 0)
    : []

  const { result: cart } = await createCartWorkflow(req.scope as any).run({
    input: {
      region_id,
      customer_id,
      email: custEmail,
      items: lineItems,
      metadata: { placed_by_rep_id: repId, drafted_by_rep: true },
    } as any,
  })

  return res.json({
    ok: true,
    cart_id: (cart as any).id,
    customer_id,
    placed_by_rep_id: repId,
    items: (cart as any).items?.length ?? 0,
  })
}
