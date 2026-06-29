import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const productModule = req.scope.resolve(Modules.PRODUCT) as any
    const { limit = 1000, offset = 0 } = req.query as any

    const products = await productModule.listProducts(
      {},
      {
        take: Number(limit) || 1000,
        skip: Number(offset) || 0,
        relations: ["variants", "collection", "categories"],
      }
    )

    const visibleProducts = (products || []).filter((product: any) => !product.deleted_at)

    res.json({
      products: visibleProducts,
      count: visibleProducts.length,
    })
  } catch (error: any) {
    console.error("Failed to fetch marketplace products:", error)
    res.status(500).json({
      message: error?.message || "Failed to fetch marketplace products",
    })
  }
}
