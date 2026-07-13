import React, { useMemo, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"

/**
 * Colour Images widget — lets the admin upload images per colour variant
 * on the Product details page. Images are saved into `metadata.images`
 * (an array of URLs) on every variant that shares the colour, so the
 * storefront's per-colour PDP gallery loader (which unions `metadata.images`
 * across a colour's variants) picks them up regardless of which variant
 * (size) is selected.
 */

const COLOUR_OPTION_RE = /^(colou?r|color)$/i

type ProductOption = {
  id: string
  title: string
  values?: { value: string }[]
}

type VariantOptionValue = {
  value: string
  option?: { title?: string }
}

type Variant = {
  id: string
  title?: string
  metadata?: Record<string, any> | null
  options?: VariantOptionValue[]
}

type Product = {
  id: string
  options?: ProductOption[]
  variants?: Variant[]
}

type ColourGroup = {
  colour: string
  variantIds: string[]
  images: string[]
}

const getVariantImages = (variant?: Variant): string[] => {
  const images = variant?.metadata?.images
  return Array.isArray(images) ? images.filter((u): u is string => typeof u === "string") : []
}

const groupByColour = (product: Product): ColourGroup[] => {
  const variants = product.variants ?? []
  const groups = new Map<string, ColourGroup>()

  for (const variant of variants) {
    const colourOptionValue = variant.options?.find((o) =>
      COLOUR_OPTION_RE.test(o.option?.title ?? ""),
    )
    const colour = colourOptionValue?.value
    if (!colour) continue

    let group = groups.get(colour)
    if (!group) {
      group = { colour, variantIds: [], images: [] }
      groups.set(colour, group)
    }
    group.variantIds.push(variant.id)
    if (group.images.length === 0) {
      const images = getVariantImages(variant)
      if (images.length > 0) {
        group.images = images
      }
    }
  }

  return Array.from(groups.values())
}

const ColourImagesRow = ({
  product,
  group,
  onSaved,
}: {
  product: Product
  group: ColourGroup
  onSaved: () => void
}) => {
  const [images, setImages] = useState<string[]>(group.images)
  const [busy, setBusy] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  const variantById = useMemo(() => {
    const map = new Map<string, Variant>()
    for (const v of product.variants ?? []) {
      map.set(v.id, v)
    }
    return map
  }, [product.variants])

  const saveImagesToVariants = async (nextImages: string[]) => {
    setBusy(true)
    try {
      await Promise.all(
        group.variantIds.map(async (variantId) => {
          const variant = variantById.get(variantId)
          const existingMetadata = variant?.metadata ?? {}
          const res = await fetch(
            `/admin/products/${product.id}/variants/${variantId}`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                metadata: {
                  ...existingMetadata,
                  images: nextImages,
                },
              }),
            },
          )
          if (!res.ok) {
            const body = await res.json().catch(() => ({}) as { message?: string })
            throw new Error(body.message ?? `HTTP ${res.status}`)
          }
        }),
      )
      setImages(nextImages)
      toast.success("Saved", {
        description: `Updated images for colour "${group.colour}".`,
      })
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save colour images.")
    } finally {
      setBusy(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setBusy(true)
    try {
      const formData = new FormData()
      Array.from(files).forEach((file) => formData.append("files", file))

      const res = await fetch(`/admin/uploads`, {
        method: "POST",
        credentials: "include",
        body: formData,
      })
      const body = await res.json().catch(() => ({}) as { message?: string })
      if (!res.ok) {
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }

      const uploaded: { url: string }[] = body.files ?? []
      const newUrls = uploaded.map((f) => f.url).filter(Boolean)
      if (newUrls.length === 0) {
        throw new Error("Upload succeeded but no URLs were returned.")
      }

      await saveImagesToVariants([...images, ...newUrls])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.")
    } finally {
      setBusy(false)
      setFileInputKey((k) => k + 1)
    }
  }

  const handleRemove = async (url: string) => {
    const nextImages = images.filter((u) => u !== url)
    await saveImagesToVariants(nextImages)
  }

  return (
    <div className="flex flex-col gap-y-3 border-t border-ui-border-base px-6 py-4">
      <div className="flex items-center justify-between">
        <Text weight="plus" size="small">
          {group.colour}
        </Text>
        <Text size="xsmall" className="text-ui-fg-subtle">
          {group.variantIds.length} variant{group.variantIds.length === 1 ? "" : "s"}
        </Text>
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <div key={url} className="relative">
              <img
                src={url}
                alt={group.colour}
                className="h-14 w-14 rounded-md border border-ui-border-base object-cover"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRemove(url)}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-ui-bg-base border border-ui-border-base text-ui-fg-subtle text-xs leading-none hover:bg-ui-bg-base-hover disabled:opacity-50"
                aria-label={`Remove image for ${group.colour}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-x-2">
        <input
          key={fileInputKey}
          type="file"
          multiple
          accept="image/*"
          disabled={busy}
          onChange={(e) => void handleUpload(e)}
          className="text-ui-fg-subtle text-xs"
        />
      </div>
    </div>
  )
}

const ColourImagesWidget = ({ data: product }: { data: Product }) => {
  const [refreshKey, setRefreshKey] = useState(0)

  const colourOption = (product.options ?? []).find((o) => COLOUR_OPTION_RE.test(o.title))

  if (!colourOption) {
    return (
      <Container className="p-6">
        <Heading level="h2">Colour Images</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          This product has no Colour option — add one to manage colour images.
        </Text>
      </Container>
    )
  }

  const groups = groupByColour(product)

  if (groups.length === 0) {
    return (
      <Container className="p-6">
        <Heading level="h2">Colour Images</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          No variants with a colour value were found.
        </Text>
      </Container>
    )
  }

  return (
    <Container className="p-0" key={refreshKey}>
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Colour Images</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Upload images per colour. Saved to every variant sharing that colour so the
            storefront gallery shows them regardless of size selected.
          </Text>
        </div>
      </div>
      {groups.map((group) => (
        <ColourImagesRow
          key={group.colour}
          product={product}
          group={group}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      ))}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ColourImagesWidget
