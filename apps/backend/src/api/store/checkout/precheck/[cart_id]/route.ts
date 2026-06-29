import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../../../../../modules/cashfree_wallet"
import { logger } from "../../../../../utils/logger"

/**
 * GET /store/checkout/precheck/:cart_id
 *
 * Returns wallet + cart totals so the checkout UI can render whether the
 * purchase will debit wallet or hold the order pending a VBA deposit.
 *
 * Response:
 * {
 *   wallet_balance_inr: number,        // paise
 *   cart_total_inr: number,            // paise
 *   shortfall_inr: number,             // paise (0 if covered)
 *   will_be_held: boolean,             // true if shortfall > 0
 *   virtual_account: {...} | null,     // present when will_be_held
 *   kyc_approved: boolean,             // gate for enabling "Pay" button
 *   processing_fee: {                  // platform fee snapshot
 *     base_rate: number,               // 0.02 = 2% (admin-configured)
 *     tier_discount_pct: number,       // retained for checkout UI compatibility
 *     effective_rate: number,          // base_rate × (1 - tier_discount/100)
 *   }
 * }
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.app_metadata?.customer_id as
    | string
    | undefined
  if (!customerId) return res.status(401).json({ message: "Not authenticated" })

  const { cart_id } = req.params

  const cartModule = req.scope.resolve("cart") as any

  const cart = await cartModule.retrieveCart(cart_id, {
    select: ["id", "customer_id", "total"],
    relations: ["items"],
  }).catch((err: unknown) => {
    logger.warn("precheck: cart lookup failed", { cart_id, err })
    return null
  })

  if (!cart) return res.status(404).json({ message: "Cart not found" })
  if (cart.customer_id && cart.customer_id !== customerId) {
    return res.status(403).json({ message: "Forbidden" })
  }

  const walletModule = req.scope.resolve(
    CASHFREE_WALLET_MODULE
  ) as CashfreeWalletService

  const [summary, kyc] = await Promise.all([
    walletModule.getWalletSummary(customerId),
    walletModule.getKycStatus(customerId),
  ])

  // Medusa cart totals are in major units (rupees). Convert to paise.
  const cartTotalRupees = Number(cart.total ?? 0)
  const cartTotalPaise = Math.round(cartTotalRupees * 100)

  // Compute the cart's line-item subtotal (qty × unit_price summed)
  // — needed for the per-tx promo cap (`max(pct × subtotal, flat)`).
  // Same math as the wallet provider so the promo coverage figure here
  // matches what authorize applies.
  const items = Array.isArray(cart?.items) ? cart.items : []
  const itemSubtotalRupees = items.reduce((sum: number, it: any) => {
    const qty = Number(it?.quantity ?? 0)
    const unit = Number(it?.unit_price ?? 0)
    return sum + qty * unit
  }, 0)
  const itemSubtotalPaise = Math.round(itemSubtotalRupees * 100)
  const promoCap = await walletModule.getPromoCapForCart(itemSubtotalPaise)
  const promoUsable = Math.min(
    Number(summary.promo_balance_inr ?? 0),
    promoCap,
  )
  const combinedAvailable = Number(summary.balance_inr) + promoUsable
  // Shortfall measured against the COMBINED bucket — matches what the
  // wallet provider will actually do at authorize. The storefront uses
  // `will_be_held` to render the "add funds first" branch, so an
  // accurate combined-balance check here prevents a spurious hold
  // warning when promo would cover the gap.
  const shortfall = Math.max(0, cartTotalPaise - combinedAvailable)

  // Platform fees were removed — no processing fee is applied. The
  // zeroed snapshot is retained so the storefront's existing checkout
  // UI (which reads `processing_fee`) keeps rendering without a fee
  // line.
  const baseRate = 0
  const tierDiscountFraction = 0
  const effectiveRate = 0

  res.json({
    /** Combined main + capped-promo. Naming retained for back-compat;
     *  the storefront's existing UI references this single field. */
    wallet_balance_inr: combinedAvailable,
    main_balance_inr: Number(summary.balance_inr),
    promo_balance_inr: Number(summary.promo_balance_inr ?? 0),
    promo_usable_inr: promoUsable,
    promo_cap_inr: promoCap,
    cart_total_inr: cartTotalPaise,
    item_subtotal_inr: itemSubtotalPaise,
    shortfall_inr: shortfall,
    will_be_held: shortfall > 0,
    // The customer may have multiple VBAs (one per linked bank). The
    // checkout UX shows all of them with a hint that any can be used to
    // add funds the shortfall.
    virtual_accounts: summary.virtual_accounts,
    kyc_approved: kyc.overall === "approved",
    kyc: kyc,
    processing_fee: {
      base_rate: baseRate,
      tier_discount_pct: Math.round(tierDiscountFraction * 100 * 100) / 100,
      effective_rate: effectiveRate,
    },
  })
}
