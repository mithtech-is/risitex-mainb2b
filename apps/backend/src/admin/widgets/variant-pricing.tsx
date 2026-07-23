import React, { useEffect, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, IconButton, Input, Table, Text, Tooltip, TooltipProvider, toast } from "@medusajs/ui"

/**
 * Variant Pricing widget — lets the admin set Wholesale price, MRP, and
 * Pack size per variant directly on the Product details page, in one
 * table. Medusa's native variant grid can't take custom columns, so this
 * widget sits right below the variants and writes both the price and the
 * metadata via the confirmed working call:
 *   POST /admin/products/{product_id}/variants/{variant_id}
 *   { prices: [{ currency_code: "inr", amount }], metadata: {...} }
 * `amount` is in MAJOR rupees (this repo stores INR in major units).
 */

type Product = {
  id: string
  variants?: { id: string; title?: string }[]
}

type FetchedVariant = {
  id: string
  title?: string | null
  metadata?: Record<string, any> | null
  prices?: { amount: number; currency_code: string }[]
}

type Row = {
  id: string
  title: string
  wholesale: string
  mrp: string
  packSize: string
  existingMetadata: Record<string, any>
}

const toRow = (variant: FetchedVariant): Row => {
  const inrPrice = variant.prices?.find((p) => p.currency_code === "inr")
  const metadata = variant.metadata ?? {}
  return {
    id: variant.id,
    title: variant.title ?? variant.id,
    wholesale: inrPrice?.amount != null ? String(inrPrice.amount) : "",
    mrp: metadata.mrp != null ? String(metadata.mrp) : "",
    packSize: metadata.pack_size != null ? String(metadata.pack_size) : "",
    existingMetadata: metadata,
  }
}

const VariantPricingWidget = ({ data: product }: { data: Product }) => {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/admin/products/${product.id}?fields=id,variants.id,variants.title,variants.metadata,variants.prices.amount,variants.prices.currency_code`,
          { credentials: "include" },
        )
        const body = await res.json().catch(() => ({}) as { message?: string })
        if (!res.ok) {
          throw new Error(body.message ?? `HTTP ${res.status}`)
        }
        const variants: FetchedVariant[] = body.product?.variants ?? []
        if (!cancelled) {
          setRows(variants.map(toRow))
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load variant pricing.")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [product.id])

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  /**
   * Excel-style fill-down: copy ONE cell's value to every variant in that
   * column. Saves the admin re-typing the same wholesale/MRP/pack figure
   * across dozens of variants — the whole point of this control. Works from
   * any row (whichever cell holds the value you want everywhere).
   */
  const fillDown = (field: "wholesale" | "mrp" | "packSize", value: string) => {
    if (value === "") return
    setRows((prev) => prev.map((r) => ({ ...r, [field]: value })))
    toast.success(`Applied ${value} to all ${rows.length} variants`)
  }

  const validate = (row: Row): string | null => {
    for (const [label, value] of [
      ["Wholesale", row.wholesale],
      ["MRP", row.mrp],
      ["Pack size", row.packSize],
    ] as const) {
      if (value === "") continue
      const n = Number(value)
      if (Number.isNaN(n) || n < 0) {
        return `${label} for "${row.title}" must be a non-negative number.`
      }
    }
    return null
  }

  const saveAll = async () => {
    for (const row of rows) {
      const error = validate(row)
      if (error) {
        toast.error(error)
        return
      }
    }

    setSaving(true)
    try {
      await Promise.all(
        rows.map(async (row) => {
          const body: Record<string, any> = {
            metadata: {
              ...row.existingMetadata,
              mrp: row.mrp === "" ? null : Number(row.mrp),
              pack_size: row.packSize === "" ? null : Number(row.packSize),
            },
          }
          if (row.wholesale !== "") {
            body.prices = [{ currency_code: "inr", amount: Number(row.wholesale) }]
          }

          const res = await fetch(`/admin/products/${product.id}/variants/${row.id}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}) as { message?: string })
            throw new Error(errBody.message ?? `HTTP ${res.status} for "${row.title}"`)
          }
        }),
      )
      toast.success("Saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save variant pricing.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Container className="p-6">
        <Heading level="h2">B2B Pricing & Packs</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Loading variant pricing…
        </Text>
      </Container>
    )
  }

  if (rows.length === 0) {
    return (
      <Container className="p-6">
        <Heading level="h2">B2B Pricing & Packs</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          This product has no variants.
        </Text>
      </Container>
    )
  }

  return (
    <Container className="p-0">
      <div className="px-6 py-4">
        <Heading level="h2">B2B Pricing & Packs</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Wholesale shows after login · MRP shows to everyone · Pack size = pieces per variant
          counted toward MOQ · Use the ⇩ next to a value to copy it to every variant
        </Text>
      </div>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Variant</Table.HeaderCell>
            <Table.HeaderCell>Wholesale (₹)</Table.HeaderCell>
            <Table.HeaderCell>MRP (₹)</Table.HeaderCell>
            <Table.HeaderCell>Pack size</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.id}>
              <Table.Cell>
                <Text size="small">{row.title}</Text>
              </Table.Cell>
              {(
                [
                  ["wholesale", row.wholesale],
                  ["mrp", row.mrp],
                  ["packSize", row.packSize],
                ] as const
              ).map(([field, value]) => (
                <Table.Cell key={field}>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      size="small"
                      value={value}
                      onChange={(e) => updateRow(row.id, { [field]: e.currentTarget.value })}
                      placeholder="—"
                    />
                    <TooltipProvider>
                      <Tooltip content="Copy this value to all variants">
                        <IconButton
                          size="small"
                          variant="transparent"
                          disabled={value === ""}
                          aria-label={`Copy this ${field} to all variants`}
                          onClick={() => fillDown(field, value)}
                        >
                          <span aria-hidden className="text-[13px] leading-none">
                            ⇩
                          </span>
                        </IconButton>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <div className="flex justify-end px-6 py-4">
        <Button variant="primary" size="small" disabled={saving} onClick={() => void saveAll()}>
          {saving ? "Saving…" : "Save all"}
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.before",
})

export default VariantPricingWidget
