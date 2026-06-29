import { model } from "@medusajs/framework/utils"

/**
 * Saved cart — a parked, restorable snapshot of a customer's Zustand
 * cart drawer. Stored per-customer; the storefront serialises its
 * `CartLine[]` into `lines` (json) so a "restore" just pours it back
 * into the cart store on the client.
 *
 * Why json (not a normalized table per line):
 *   The cart store on the storefront is its own owner — Medusa carts
 *   are minted at /store/checkout/begin, not at "Save for later".
 *   Treating `lines` as an opaque blob keeps this module decoupled
 *   from product / variant lifecycle.
 *
 * `shared_with` is an array of emails the owner is willing to share
 * the cart with. The share workflow itself (notification email +
 * acceptance) is deferred; for now the column just remembers the
 * intent so the UI can render the "shared with" chips and a future
 * worker can iterate them.
 */
export const SavedCart = model
  .define("saved_cart", {
    id: model.id({ prefix: "sc" }).primaryKey(),

    customer_id: model.text().index(),
    company_id: model.text().index().nullable(),

    name: model.text(),
    note: model.text().nullable(),

    /**
     * Frozen snapshot of CartLine[] — see
     * apps/storefront/src/store/cart.ts for the canonical shape.
     */
    lines: model.json(),

    /** Denormalised counters so list views don't have to walk lines. */
    item_count: model.number().default(0),
    total_minor: model.bigNumber().default(0),
    currency_code: model.text().default("inr"),

    /** Email addresses to share the cart with. Empty array = personal. */
    shared_with: model.json().nullable(),

    /**
     * URL-safe random token used as the only credential to view the
     * cart via /store/shared-carts/:token. Minted lazily on first
     * "Share" — null until then so untouched carts can't be enumerated.
     */
    share_token: model.text().index().nullable(),
    share_token_created_at: model.dateTime().nullable(),

    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["customer_id"], unique: false, where: "deleted_at IS NULL" },
    {
      on: ["company_id"],
      unique: false,
      where: "company_id IS NOT NULL AND deleted_at IS NULL",
    },
  ])
