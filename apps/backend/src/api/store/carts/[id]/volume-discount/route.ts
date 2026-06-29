import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
  PromotionActions,
} from "@medusajs/framework/utils"
import {
  createPromotionsWorkflow,
  updateCartPromotionsWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  loadVolumeTiers,
  resolveVolumeDiscount,
} from "../../../../../lib/volume-discount"

/**
 * POST /store/carts/:id/volume-discount  (FR-6.03)
 *
 * No-code automatic volume discount. Reads the cart's total units, resolves the
 * best configured tier (B2B_VOLUME_DISCOUNTS), and ensures the matching
 * AUTO_VOL_<percent> promotion is applied — replacing any lower volume tier, or
 * removing it entirely when the cart no longer qualifies. The storefront calls
 * this whenever the cart changes, so the buyer never types a code.
 *
 * AUTO_VOL_* codes are exempt from the FR-6.04 tier-exclusivity check (they're
 * meant to stack on tier pricing).
 */

const PREFIX = "AUTO_VOL_"

async function cartFacts(
  scope: MedusaRequest["scope"],
  cartId: string,
): Promise<{ units: number; volCodes: string[] }> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "items.quantity", "promotions.code"],
    filters: { id: cartId },
  })
  const cart = carts?.[0] as
    | {
        items?: Array<{ quantity?: number }>
        promotions?: Array<{ code?: string | null }>
      }
    | undefined
  const units = (cart?.items ?? []).reduce(
    (s, it) => s + Number(it.quantity ?? 0),
    0,
  )
  const volCodes = (cart?.promotions ?? [])
    .map((p) => p?.code ?? "")
    .filter((c) => c.startsWith(PREFIX))
  return { units, volCodes }
}

async function ensureVolumePromo(
  scope: MedusaRequest["scope"],
  percent: number,
): Promise<string> {
  const code = `${PREFIX}${percent}`
  const promo = scope.resolve(Modules.PROMOTION) as {
    listPromotions: (
      f: { code: string[] },
      c?: { take?: number },
    ) => Promise<Array<{ id: string }>>
  }
  const existing = await promo.listPromotions({ code: [code] }, { take: 1 })
  if (existing?.length) return code
  await createPromotionsWorkflow(scope).run({
    input: {
      promotionsData: [
        {
          code,
          type: "standard",
          status: "active",
          application_method: {
            type: "percentage",
            target_type: "order",
            allocation: "across",
            value: percent,
          },
        },
      ],
    },
  })
  return code
}

async function setCartPromos(
  scope: MedusaRequest["scope"],
  cartId: string,
  codes: string[],
  action: PromotionActions,
): Promise<void> {
  if (codes.length === 0) return
  await updateCartPromotionsWorkflow(scope).run({
    input: { cart_id: cartId, promo_codes: codes, action },
  })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const { units, volCodes } = await cartFacts(req.scope, cartId)
  const tier = resolveVolumeDiscount(units, loadVolumeTiers())

  if (!tier) {
    await setCartPromos(req.scope, cartId, volCodes, PromotionActions.REMOVE)
    return res.json({ ok: true, applied: null, units })
  }

  const code = await ensureVolumePromo(req.scope, tier.percent)
  const stale = volCodes.filter((c) => c !== code)
  await setCartPromos(req.scope, cartId, stale, PromotionActions.REMOVE)
  if (!volCodes.includes(code)) {
    await setCartPromos(req.scope, cartId, [code], PromotionActions.ADD)
  }
  return res.json({ ok: true, applied: code, percent: tier.percent, units })
}
