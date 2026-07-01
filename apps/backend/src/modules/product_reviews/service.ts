import { MedusaService } from "@medusajs/framework/utils"
import { ProductReview } from "./models/product-review"

class ProductReviewsModuleService extends MedusaService({ ProductReview }) {}

export default ProductReviewsModuleService
