import { model } from "@medusajs/framework/utils"

export const ProductReview = model
  .define("product_review", {
    id: model.id({ prefix: "pr" }).primaryKey(),

    product_id: model.text(),

    customer_name: model.text(),
    customer_email: model.text(),
    customer_id: model.text().nullable(),

    rating: model.number(),
    title: model.text().nullable(),
    body: model.text(),

    is_public: model.boolean().default(false),
    moderated_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["product_id", "is_public"], unique: false }])
