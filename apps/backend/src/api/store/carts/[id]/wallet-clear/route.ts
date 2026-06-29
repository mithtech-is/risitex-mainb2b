import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * POST /store/carts/:id/wallet-clear
 *
 * Strips the wallet-apply intent off the cart metadata. The customer
 * is going to pay the full amount via Razorpay instead.
 *
 * Body: {} (none)
 */
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

    const cartModule = req.scope.resolve(Modules.CART) as unknown as {
        retrieveCart: (
            id: string,
            config?: { select?: string[] },
        ) => Promise<{
            id: string
            customer_id: string | null
            metadata: Record<string, unknown> | null
        } | null>
        updateCarts: (
            input: { id: string; metadata: Record<string, unknown> },
        ) => Promise<unknown>
    }
    const cart = await cartModule
        .retrieveCart(cartId, { select: ["id", "customer_id", "metadata"] })
        .catch(() => null)
    if (!cart) {
        return res.status(404).json({ message: "Cart not found" })
    }
    if (cart.customer_id && cart.customer_id !== customerId) {
        return res.status(403).json({
            message: "You can only modify your own cart.",
        })
    }

    const meta = (cart.metadata ?? {}) as Record<string, unknown>
    if (!("wallet_apply" in meta)) {
        return res.json({ cart_id: cartId, cleared: false, message: "Nothing to clear" })
    }
    const next = { ...meta }
    delete next.wallet_apply
    try {
        await cartModule.updateCarts({ id: cartId, metadata: next })
    } catch (err) {
        const message = err instanceof Error ? err.message : "cart update failed"
        return res.status(500).json({ message })
    }

    return res.json({ cart_id: cartId, cleared: true })
}
