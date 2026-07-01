import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRODUCT_REVIEWS_MODULE } from "../../../modules/product_reviews"
import type ProductReviewsModuleService from "../../../modules/product_reviews/service"

/**
 * GET /admin/product-reviews?product_id=&unmoderated=true
 *
 * Lists reviews for moderation. Optionally filter by product or to only
 * unmoderated ones.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = (req.query.product_id ?? "").toString().trim()
  const unmoderated = (req.query.unmoderated ?? "").toString() === "true"

  const svc = req.scope.resolve<ProductReviewsModuleService>(
    PRODUCT_REVIEWS_MODULE,
  )
  const filter: Record<string, unknown> = {}
  if (productId) filter.product_id = productId
  if (unmoderated) filter.is_public = false

  const [reviews, count] = await svc.listAndCountProductReviews(filter, {
    order: { created_at: "DESC" },
    take: 100,
  })
  res.json({ reviews, count })
}

/**
 * POST /admin/product-reviews
 *
 * Moderate (approve/reject) a review.
 * Body: { id, is_public }
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as {
    id?: string
    is_public?: boolean
  }

  const id = (body.id ?? "").trim()
  if (!id) {
    return res.status(400).json({ message: "id is required" })
  }

  const svc = req.scope.resolve<ProductReviewsModuleService>(
    PRODUCT_REVIEWS_MODULE,
  )
  const updated = await svc.updateProductReviews({
    id,
    is_public: body.is_public ?? true,
    moderated_at: new Date(),
  })

  res.json({ review: updated })
}
