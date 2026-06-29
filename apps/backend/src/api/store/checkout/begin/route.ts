import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { createCartWorkflow } from "@medusajs/medusa/core-flows"

type SeedVariantInfo = {
  region_id: string
  variant_id: string
  unit_price_paise: number
}

/**
 * Lazily resolve the INR region (always required) and the seeded
 * storefront line-item variant (used only for the legacy
 * `cart_total_paise` fallback path). Cached across requests — the
 * seed is idempotent and the IDs don't change unless the DB is wiped.
 *
 * Returns null when the region seed hasn't been run; the caller
 * surfaces a friendly error.
 */
let cached: SeedVariantInfo | null = null
async function loadSeedInfo(
  scope: MedusaRequest["scope"],
): Promise<SeedVariantInfo | null> {
  if (cached) return cached
  const region = scope.resolve(Modules.REGION)
  const product = scope.resolve(Modules.PRODUCT)

  const regions = await region.listRegions(
    { currency_code: "inr" },
    { take: 1 },
  )
  const r = regions[0]
  if (!r) return null

  const products = await product.listProducts(
    { handle: "risitex-storefront-line-item" },
    { relations: ["variants"], take: 1 },
  )
  const p = products[0]
  // The placeholder variant is only needed for the legacy paise-total
  // fallback. With rich items provided we don't need it at all.
  const variants =
    (p as unknown as { variants?: Array<{ id: string }> } | undefined)?.variants
  cached = {
    region_id: r.id,
    variant_id: variants?.[0]?.id ?? "",
    unit_price_paise: 100, // seed sets ₹1 = 100 paise per unit
  }
  return cached
}

async function loadInrRegionId(
  scope: MedusaRequest["scope"],
): Promise<string | null> {
  const region = scope.resolve(Modules.REGION)
  const regions = await region.listRegions({ currency_code: "inr" }, { take: 1 })
  return regions[0]?.id ?? null
}

/**
 * POST /store/checkout/begin
 *
 * Materialises the storefront's local Zustand cart into a real
 * Medusa cart so the rest of the checkout flow (wallet-apply,
 * payment session, place-order subscribers) can run end-to-end.
 *
 * Two body shapes are supported, in priority order:
 *
 *   1) Rich items (Phase 11.M — preferred):
 *        { items: [{ variant_id, quantity }, ...] }
 *      Each item is a real Medusa product variant; the cart inherits
 *      the catalog's per-variant prices (tier price lists, promos,
 *      tax lines, etc). Use this when every line in the storefront
 *      cart has a `medusaVariantId` set.
 *
 *   2) Legacy total (Phase 11.L — fallback):
 *        { cart_total_paise: number }
 *      Buys `ceil(total / 100)` units of the ₹1 storefront-line-item
 *      seed variant. Keeps the fixture-only carts that haven't been
 *      remapped to real variants working end-to-end.
 *
 * Returns:
 *   { cart_id, region_id, currency_code, item_count, mode }
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

  const body = (req.body ?? {}) as {
    cart_total_paise?: number
    items?: Array<{ variant_id?: string; quantity?: number }>
  }

  // Sanity caps — Phase D.1 server-side hardening.
  //   MAX_LINES   — line count per cart. 50 covers a generous mixed
  //                 wholesale order; anything past it is almost
  //                 certainly a misbehaving client.
  //   MAX_QTY     — qty per line. 5000 leaves room for B2B bulk
  //                 (master cartons of ~100 × multi-carton orders)
  //                 while blocking client-side overflow attempts.
  const MAX_LINES = 50
  const MAX_QTY = 5000

  const rich = Array.isArray(body.items)
    ? body.items
        .filter((it) => it && typeof it.variant_id === "string" && it.variant_id.length > 0)
        .slice(0, MAX_LINES)
        .map((it) => ({
          variant_id: it.variant_id as string,
          quantity: Math.min(
            MAX_QTY,
            Math.max(1, Math.floor(Number(it.quantity ?? 1))),
          ),
        }))
    : []

  if (rich.length > 0) {
    const regionId = await loadInrRegionId(req.scope)
    if (!regionId) {
      return res.status(503).json({
        message: "INR region not provisioned. Run seed:checkout from the backend.",
      })
    }

    // Variant existence pre-flight. createCartWorkflow would fail
    // later if a variant id doesn't exist, but the error surfaces as
    // a generic 500 from deep inside the workflow runner — surface a
    // clean 422 here with the list of bad ids instead.
    try {
      const productService = req.scope.resolve(Modules.PRODUCT) as unknown as {
        listProductVariants: (
          filters: { id: string[] },
          config?: { take?: number },
        ) => Promise<Array<{ id: string; product_id?: string | null }>>
      }
      const requestedIds = Array.from(new Set(rich.map((r) => r.variant_id)))
      const found = await productService.listProductVariants(
        { id: requestedIds },
        { take: requestedIds.length },
      )
      const foundIds = new Set(found.map((v) => v.id))
      const missing = requestedIds.filter((id) => !foundIds.has(id))
      if (missing.length > 0) {
        return res.status(422).json({
          message: "One or more items aren't available.",
          code: "checkout.unknown_variant",
          missing_variant_ids: missing,
        })
      }
    } catch (err) {
      // Variant lookup is a soft guard — if the product module hiccups
      // we fall through and let the cart workflow surface the error.
      const message = err instanceof Error ? err.message : "Unknown error"
      console.warn(
        `[checkout/begin] variant pre-flight failed (continuing): ${message}`,
      )
    }

    try {
      const { result } = await createCartWorkflow(req.scope).run({
        input: {
          region_id: regionId,
          customer_id: customerId,
          currency_code: "inr",
          items: rich,
          metadata: {
            source: "storefront-checkout-begin",
            mode: "rich",
          },
        },
      })
      const cart = result as {
        id: string
        region_id: string
        currency_code: string
      }
      return res.json({
        cart_id: cart.id,
        region_id: cart.region_id,
        currency_code: cart.currency_code,
        item_count: rich.length,
        mode: "rich",
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      return res.status(500).json({
        message: `Failed to create cart: ${message}`,
      })
    }
  }

  // Legacy: pay by total-paise via the ₹1 helper variant.
  const totalPaise = Number(body.cart_total_paise)
  if (
    !Number.isFinite(totalPaise) ||
    totalPaise <= 0 ||
    !Number.isInteger(totalPaise)
  ) {
    return res.status(400).json({
      message:
        "Provide either { items: [{variant_id, quantity}] } or " +
        "{ cart_total_paise: positive integer paise }",
    })
  }

  const seed = await loadSeedInfo(req.scope)
  if (!seed || !seed.variant_id) {
    return res.status(503).json({
      message:
        "Checkout seed not run. From the backend: " +
        "pnpm exec medusa exec ./src/scripts/seed-checkout.ts",
    })
  }
  const quantity = Math.ceil(totalPaise / seed.unit_price_paise)

  try {
    const { result } = await createCartWorkflow(req.scope).run({
      input: {
        region_id: seed.region_id,
        customer_id: customerId,
        currency_code: "inr",
        items: [{ variant_id: seed.variant_id, quantity }],
        metadata: {
          source: "storefront-checkout-begin",
          mode: "legacy-paise",
          original_total_paise: totalPaise,
        },
      },
    })
    const cart = result as {
      id: string
      region_id: string
      currency_code: string
    }
    return res.json({
      cart_id: cart.id,
      region_id: cart.region_id,
      currency_code: cart.currency_code,
      seed_variant_id: seed.variant_id,
      quantity,
      item_count: 1,
      mode: "legacy-paise",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return res.status(500).json({
      message: `Failed to create cart: ${message}`,
    })
  }
}
