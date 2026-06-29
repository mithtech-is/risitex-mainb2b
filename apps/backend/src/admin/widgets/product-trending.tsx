import React, { useEffect, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Switch, Text, toast } from "@medusajs/ui"

const isProductTrending = (metadata?: Record<string, any>) => {
  return metadata?.is_trending === true || metadata?.is_trending === "true"
}

const ProductTrendingWidget = ({ data: product }: { data: any }) => {
  const [isTrending, setIsTrending] = useState(isProductTrending(product?.metadata))
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    setIsTrending(isProductTrending(product?.metadata))
  }, [product?.id, product?.metadata])

  const handleToggle = async (checked: boolean) => {
    setIsUpdating(true)
    try {
      const response = await fetch(`/admin/products/${product.id}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metadata: {
            ...(product.metadata || {}),
            is_trending: checked,
            trending_updated_at: new Date().toISOString(),
          },
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update product")
      }

      setIsTrending(checked)
      toast.success("Success", {
        description: `Product ${checked ? "marked as trending" : "removed from trending"}.`,
      })
    } catch (error) {
      console.error("Error updating trending status:", error)
      toast.error("Error", {
        description: "Could not update trending status.",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Container className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h2">Trending Product</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Control whether this product appears in the live trending section on the storefront.
          </Text>
        </div>
        <div className="flex items-center gap-x-2">
          <Switch
            checked={isTrending}
            onCheckedChange={handleToggle}
            disabled={isUpdating}
          />
          <Text size="small" className="font-medium">
            {isTrending ? "Trending" : "Not Trending"}
          </Text>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.before",
})

export default ProductTrendingWidget
