import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { B2B_PRICING_MODULE } from "../../../../../modules/b2b_pricing"
import { removeTierPriceList } from "../../../../../lib/tier-price-list"

/**
 * DELETE /admin/b2b-sales/price-tiers/:id — soft-delete a tier bracket and
 * remove its mirrored native Price List (FR-4.01). The engine stays the source
 * of truth.
 */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const svc = req.scope.resolve(B2B_PRICING_MODULE) as any

  // Tear down the projected native price list first (needs the row's
  // price_list_id), then soft-delete the engine row.
  const row = await svc.retrievePriceTier(id).catch(() => null)
  if (row) {
    try {
      await removeTierPriceList(req.scope, row)
    } catch {
      /* price list already gone — proceed with the engine-row delete */
    }
  }

  await svc.deletePriceTiers([id])
  return res.json({ id, object: "price_tier", deleted: true })
}
