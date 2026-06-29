import { model } from "@medusajs/framework/utils"

/**
 * Tracks a "Grid/Matrix UI" cart-edit session (FR-3.01). One row
 * per (cart_id, product_id) — the matrix lets the buyer enter
 * quantities across the full PIX size curve (S, M, L, XL, XXL) in
 * a single edit, and the cart route mirrors that grid into Medusa
 * line items.
 *
 * `grid` is a JSON map {"S":12,"M":24,...} — values are unit
 * counts. The cart route applies `qty` updates per variant. The
 * row is preserved so the storefront can re-show the matrix the
 * way the buyer left it across page reloads.
 */
export const MatrixOrderSession = model
  .define("matrix_order_session", {
    id: model.id({ prefix: "mxsess" }).primaryKey(),

    cart_id: model.text(),
    product_id: model.text(),

    grid: model.json(),

    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["cart_id", "product_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { on: ["cart_id"], unique: false, where: "deleted_at IS NULL" },
  ])
