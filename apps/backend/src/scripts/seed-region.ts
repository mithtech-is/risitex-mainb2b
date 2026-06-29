/**
 * Seed a default India region with INR currency.
 *
 * The storefront's product fetch asks Medusa for `calculated_price`
 * which requires a region context. Without any region rows, the
 * fetch fails with 400 ("Missing required pricing context") and the
 * storefront silently falls back to its in-process sample catalogue
 * — which has fake product ids like `sample-api-holdings`. Those
 * fake ids then fail every downstream backend lookup (watchlist
 * POST, price-alerts POST, etc.) with "Product not found".
 *
 * One row is all this needs.
 *
 * Idempotent — checks for an existing INR region before creating.
 *
 * Run:  `npm run seed:region`
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows"

export default async function seedRegion({ container }: ExecArgs) {
    const logger = container.resolve("logger")
    const regionModule = container.resolve(Modules.REGION) as any

    const existing = await regionModule.listRegions({ currency_code: "inr" })
    if (existing.length > 0) {
        logger.info(
            `INR region already exists (${existing[0].name} — ${existing[0].id}). Skipping.`,
        )
        return
    }

    await createRegionsWorkflow(container).run({
        input: {
            regions: [
                {
                    name: "India",
                    currency_code: "inr",
                    countries: ["in"],
                    // No payment providers configured here — they'd
                    // require Cashfree credentials which the worktree
                    // .env leaves blank. Carts can still calculate
                    // prices and the storefront product fetch unblocks.
                    payment_providers: [],
                },
            ],
        },
    })

    logger.info(`Created India / INR region. Storefront should now fetch products with calculated_price successfully.`)
}
