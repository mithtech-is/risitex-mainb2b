import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
    CASHFREE_WALLET_MODULE,
    CashfreeWalletService,
} from "../../../../../modules/cashfree_wallet"

/**
 * POST /store/carts/:id/wallet-apply
 *
 * Records the customer's intent to apply N paise of their wallet
 * balance against the cart total at order-placement time. The amount
 * is capped at:
 *
 *   - The customer's combined wallet (main + promo, capped by the
 *     per-tx promo cap).
 *   - The cart total.
 *
 * The capped amount is written into `cart.metadata.wallet_apply.
 * amount_paise`. Medusa's complete-cart workflow copies cart metadata
 * onto order metadata, and the `order-placed-wallet-debit` subscriber
 * reads it and calls cashfree_wallet.debitForOrder() with idempotency
 * key `order_<id>`.
 *
 * Body: { amount_paise: number }
 *
 * Response (mirrors the storefront's WalletApplyResponse shape):
 *   {
 *     cart_id, currency_code, cart_total_paise,
 *     wallet_amount_paise, remaining_paise,
 *     wallet: { balance_inr, promo_balance_inr, status }
 *   }
 *
 * Note: Phase 5 / Phase 11.I added /admin/wallets routes; this is the
 * customer-facing companion that the checkout page hits.
 */

// Auth + verification are enforced by the `/store/carts/:id/wallet-apply`
// matcher in middlewares.ts. The handler below trusts that auth_context
// has been populated by the time it runs.

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const customerId = (
        req as unknown as {
            auth_context?: { app_metadata?: { customer_id?: string } }
        }
    ).auth_context?.app_metadata?.customer_id
    if (!customerId) {
        return res.status(401).json({ message: "Not authenticated" })
    }

    const cartId = req.params.id
    if (!cartId) {
        return res.status(400).json({ message: "cart id required" })
    }

    const body = (req.body ?? {}) as { amount_paise?: number }
    const requested = Number(body.amount_paise)
    if (!Number.isFinite(requested) || requested < 0 || !Number.isInteger(requested)) {
        return res.status(400).json({
            message: "amount_paise must be a non-negative integer (paise)",
        })
    }

    // ── Cart ownership ─────────────────────────────────────────
    const cartModule = req.scope.resolve(Modules.CART) as unknown as {
        retrieveCart: (
            id: string,
            config?: { select?: string[] },
        ) => Promise<{
            id: string
            customer_id: string | null
            currency_code: string
            total: number | string | null
            metadata: Record<string, unknown> | null
        } | null>
        updateCarts: (
            input: { id: string; metadata: Record<string, unknown> },
        ) => Promise<unknown>
    }
    const cart = await cartModule
        .retrieveCart(cartId, {
            select: ["id", "customer_id", "currency_code", "total", "metadata"],
        })
        .catch(() => null)
    if (!cart) {
        return res.status(404).json({ message: "Cart not found" })
    }
    if (cart.customer_id && cart.customer_id !== customerId) {
        return res.status(403).json({
            message: "You can only apply wallet to your own cart.",
        })
    }

    // ── Wallet read ────────────────────────────────────────────
    const walletModule = req.scope.resolve(
        CASHFREE_WALLET_MODULE,
    ) as CashfreeWalletService
    const summary = await walletModule.getWalletSummary(customerId)
    if (summary.status === "frozen") {
        return res.status(403).json({
            code: "wallet.frozen",
            message:
                "Your wallet is on hold — please contact support before applying it to an order.",
        })
    }

    // Cart.total is in rupees (major units); convert to paise so all
    // arithmetic is integer.
    const cartTotalPaise = Math.max(
        0,
        Math.round(Number(cart.total ?? 0) * 100),
    )

    // Combined wallet budget. Promo bucket is bounded by the per-tx
    // cap (same math the cashfree-wallet provider applies at authorize
    // time, so the cap shown to the user matches what actually debits).
    const promoCap = await walletModule.getPromoCapForCart(cartTotalPaise)
    const promoUsable = Math.min(
        Number(summary.promo_balance_inr ?? 0),
        promoCap,
    )
    const combinedAvailable = Number(summary.balance_inr) + promoUsable

    // Final cap: min(requested, combined available, cart total).
    const applyPaise = Math.min(requested, combinedAvailable, cartTotalPaise)

    const mergedMetadata = {
        ...((cart.metadata ?? {}) as Record<string, unknown>),
        wallet_apply: {
            amount_paise: applyPaise,
            applied_at: new Date().toISOString(),
        },
    }

    try {
        await cartModule.updateCarts({ id: cartId, metadata: mergedMetadata })
    } catch (err) {
        const message = err instanceof Error ? err.message : "cart update failed"
        return res.status(500).json({ message })
    }

    return res.json({
        cart_id: cartId,
        currency_code: cart.currency_code,
        cart_total_paise: cartTotalPaise,
        wallet_amount_paise: applyPaise,
        remaining_paise: Math.max(0, cartTotalPaise - applyPaise),
        wallet: {
            balance_inr: Number(summary.balance_inr),
            promo_balance_inr: Number(summary.promo_balance_inr ?? 0),
            status: summary.status,
        },
    })
}
