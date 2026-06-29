import { model } from "@medusajs/framework/utils";

/**
 * A customer-submitted question about a product. `product_id` stores the
 * storefront product handle/slug (the storefront keys PDPs by slug). New
 * questions default to `is_public=false` until an admin answers and
 * publishes them. `created_at`/`updated_at`/`deleted_at` are managed
 * automatically by MedusaService.
 */
export const ProductQuestion = model
  .define("product_question", {
    id: model.id({ prefix: "pq" }).primaryKey(),

    product_id: model.text(),

    customer_name: model.text(),
    customer_email: model.text(),

    question: model.text(),
    answer: model.text().nullable(),

    is_public: model.boolean().default(false),
    answered_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["product_id", "is_public"], unique: false }]);
