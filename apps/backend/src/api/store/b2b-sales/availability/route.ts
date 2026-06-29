import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { computeAvailability } from "../../../../lib/inventory-availability"

/**
 * GET /store/b2b-sales/availability
 *
 * FR-9.02 — returns sellable ("Available") stock per SKU for the storefront,
 * computed as physical (ERPNext actual_qty cached on the inventory level)
 * minus reserved (ERPNext reserved_qty cached in inventory_item.metadata by
 * the INVENTORY_BIN pull mapping). MBOs must never see raw physical stock,
 * which would let them order units already promised to pending Sales Orders.
 *
 * Query params:
 *   - sku: optional comma-separated list to scope the response.
 *   - limit: optional cap (default 200) when no sku filter is given.
 *
 * Response:
 *   { availability: [{ sku, physical, reserved, available }] }
 *
 * Auth is optional (the `/store/b2b-sales*` matcher allows unauthenticated)
 * so the public catalog can show availability; pricing gating is handled by
 * the separate pricing endpoint.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const skuParam = (req.query.sku as string) || ""
  const skus = skuParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const limit = Math.min(Number(req.query.limit) || 200, 1000)

  const { data: items } = await query.graph({
    entity: "inventory_item",
    fields: ["sku", "metadata", "location_levels.stocked_quantity"],
    filters: skus.length ? { sku: skus } : {},
    pagination: skus.length ? undefined : { take: limit },
  })

  const availability = (items ?? [])
    .filter((it: any) => it?.sku)
    .map((it: any) => {
      const levels: Array<{ stocked_quantity?: number | null }> =
        it.location_levels ?? []
      const physical = levels.length
        ? levels.reduce(
            (sum, l) => sum + Number(l?.stocked_quantity ?? 0),
            0,
          )
        : null

      const reservedRaw = (it.metadata ?? {})?.erpnext_reserved_qty
      const reserved =
        reservedRaw == null || reservedRaw === ""
          ? null
          : Number(reservedRaw)

      const { physical: phys, reserved: resv, available } = computeAvailability({
        physical,
        reserved: Number.isFinite(reserved as number) ? (reserved as number) : null,
      })

      return { sku: it.sku, physical: phys, reserved: resv, available }
    })

  return res.json({ availability })
}
