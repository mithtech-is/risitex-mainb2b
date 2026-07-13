import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRODUCT_REVIEWS_MODULE } from "../../../modules/product_reviews"
import type ProductReviewsModuleService from "../../../modules/product_reviews/service"

/**
 * GET /store/product-reviews?product_id=<handle>
 *
 * Returns public (moderated) reviews for a product, newest first.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = (req.query.product_id ?? "").toString().trim()
  if (!productId) {
    return res.status(400).json({ message: "product_id is required" })
  }

  const svc = req.scope.resolve<ProductReviewsModuleService>(
    PRODUCT_REVIEWS_MODULE,
  )
  const [reviews, count] = await svc.listAndCountProductReviews(
    { product_id: productId, is_public: true },
    { order: { created_at: "DESC" }, take: 50 },
  )
  res.json({ reviews, count })
}

/**
 * POST /store/product-reviews
 *
 * Submit a new review. Published immediately so it appears to all shoppers
 * and builds trust; an admin can still hide it later from the inbox by
 * setting is_public back to false.
 * Body: { product_id, customer_name, customer_email, rating, title?, body }
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as {
    product_id?: string
    customer_name?: string
    customer_email?: string
    rating?: number
    title?: string
    body?: string
  }

  const product_id = (body.product_id ?? "").trim()
  const customer_name = (body.customer_name ?? "").trim()
  const customer_email = (body.customer_email ?? "").trim().toLowerCase()
  const rating = body.rating
  const title = (body.title ?? "").trim() || undefined
  const reviewBody = (body.body ?? "").trim()

  if (!product_id || !customer_name || !customer_email || rating == null || !reviewBody) {
    return res.status(400).json({
      message: "product_id, customer_name, customer_email, rating and body are required",
    })
  }

  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return res.status(400).json({ message: "rating must be an integer between 1 and 5" })
  }

  const customerId =
    ((req as any).auth_context?.app_metadata?.customer_id as string | undefined) ?? null

  const svc = req.scope.resolve<ProductReviewsModuleService>(
    PRODUCT_REVIEWS_MODULE,
  )
  const created = await svc.createProductReviews({
    product_id,
    customer_name,
    customer_email,
    customer_id: customerId,
    rating,
    title: title ?? null,
    body: reviewBody,
    is_public: true,
  })

  res.status(201).json({ review: created })
}
