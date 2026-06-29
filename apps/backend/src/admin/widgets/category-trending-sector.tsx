import React, { useEffect, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Switch, Text, toast } from "@medusajs/ui"

const isTrendingSectorCategory = (metadata?: Record<string, unknown>) => {
  return metadata?.is_trending_sector === true || metadata?.is_trending_sector === "true"
}

const CategoryTrendingSectorWidget = ({ data: category }: { data: any }) => {
  const [isTrendingSector, setIsTrendingSector] = useState(isTrendingSectorCategory(category?.metadata))
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    setIsTrendingSector(isTrendingSectorCategory(category?.metadata))
  }, [category?.id, category?.metadata])

  const handleToggle = async (checked: boolean) => {
    setIsUpdating(true)

    try {
      const response = await fetch(`/admin/product-categories/${category.id}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metadata: {
            ...(category.metadata || {}),
            is_trending_sector: checked,
            trending_sector_updated_at: new Date().toISOString(),
          },
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update category")
      }

      setIsTrendingSector(checked)
      toast.success("Success", {
        description: `Category ${checked ? "added to" : "removed from"} homepage trending sectors.`,
      })
    } catch (error) {
      console.error("Error updating trending sector category:", error)
      toast.error("Error", {
        description: "Could not update category trending sector status.",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Container className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h2">Homepage Trending Sector</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Enable this category to show it in the homepage trending sectors section. Category ranking controls display order.
          </Text>
        </div>
        <div className="flex items-center gap-x-2">
          <Switch
            checked={isTrendingSector}
            onCheckedChange={handleToggle}
            disabled={isUpdating}
          />
          <Text size="small" className="font-medium">
            {isTrendingSector ? "Trending Sector" : "Not Featured"}
          </Text>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product_category.details.before",
})

export default CategoryTrendingSectorWidget
