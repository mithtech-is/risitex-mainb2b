import React, { useEffect, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Input, Button, Text, toast } from "@medusajs/ui"

/**
 * Two-column B2B pricing on the product page:
 *   • Wholesale price  → the native Medusa variant price (set in Pricing above).
 *                        Shown on the storefront ONLY after B2B login.
 *   • MRP (retail)     → stored on product metadata.mrp (major rupees).
 *                        Shown to EVERYONE, including logged-out visitors.
 *
 * The native price editor already covers wholesale; this widget adds the MRP
 * column so both prices live on the product.
 */
const ProductMrpPricingWidget = ({ data: product }: { data: any }) => {
  const metaMrp = product?.metadata?.mrp
  const [mrp, setMrp] = useState<string>(
    metaMrp === undefined || metaMrp === null ? "" : String(metaMrp),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const m = product?.metadata?.mrp
    setMrp(m === undefined || m === null ? "" : String(m))
  }, [product?.id, product?.metadata?.mrp])

  // Lowest variant price → representative wholesale price (display only).
  const wholesale: number | null = (() => {
    const amounts: number[] = []
    for (const v of product?.variants ?? []) {
      for (const p of v?.prices ?? []) {
        if (p?.currency_code === "inr" && typeof p.amount === "number") {
          amounts.push(p.amount)
        }
      }
    }
    return amounts.length ? Math.min(...amounts) : null
  })()

  const save = async () => {
    setSaving(true)
    try {
      const parsed = mrp.trim() === "" ? null : Number(mrp)
      if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
        toast.error("Invalid MRP", { description: "Enter a valid amount in rupees." })
        setSaving(false)
        return
      }
      const res = await fetch(`/admin/products/${product.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: { ...(product.metadata || {}), mrp: parsed },
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success("Saved", { description: "MRP updated." })
    } catch (e) {
      toast.error("Error", {
        description: e instanceof Error ? e.message : "Could not save MRP.",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="p-6">
      <div className="mb-4">
        <Heading level="h2">B2B Pricing</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Two prices per product. MRP shows to everyone; wholesale shows only
          after B2B login.
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-ui-border-base p-4">
          <Text size="small" weight="plus">
            Wholesale price (after login)
          </Text>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {wholesale !== null ? `₹ ${wholesale.toLocaleString("en-IN")} / pc` : "Set in the Pricing section above"}
          </Text>
          <Text size="xsmall" className="mt-2 text-ui-fg-muted">
            This is the native variant price. Edit it in the product’s Pricing editor.
          </Text>
        </div>

        <div className="rounded-lg border border-ui-border-base p-4">
          <Text size="small" weight="plus">
            MRP / retail price (shown to everyone)
          </Text>
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
              placeholder="e.g. 549"
              className="max-w-[160px]"
            />
            <Button size="small" onClick={save} isLoading={saving} disabled={saving}>
              Save MRP
            </Button>
          </div>
          <Text size="xsmall" className="mt-2 text-ui-fg-muted">
            In rupees per piece. Leave blank to hide MRP.
          </Text>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.before",
})

export default ProductMrpPricingWidget
