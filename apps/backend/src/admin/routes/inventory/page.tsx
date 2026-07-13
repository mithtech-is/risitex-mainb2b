import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArchiveBox } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Select,
  Table,
  Text,
} from "@medusajs/ui"
import React, { useCallback, useEffect, useMemo, useState } from "react"

/**
 * /admin/inventory — read-only operations view over Medusa's native
 * inventory module (inventory items + location levels), seeded for every
 * product variant (see src/scripts/seed-inventory.ts — 52 items, one
 * stock location "Bangalore HQ", operational metadata in
 * inventory_item.metadata: reorder_level / safety_stock / damaged /
 * incoming).
 *
 * No dedicated API routes — reads straight off the native
 * /admin/inventory-items and /admin/stock-locations endpoints and does
 * all flattening/searching/filtering/aggregation client-side. Editing
 * stock levels is a later phase; for now this is purely a scannable
 * dashboard: summary tiles, search, filters, and a flagged low/out-of-
 * stock table.
 */

const INVENTORY_ITEMS_URL =
  "/admin/inventory-items?limit=200&fields=id,sku,updated_at,metadata,location_levels.location_id,location_levels.stocked_quantity,location_levels.reserved_quantity,location_levels.available_quantity,variants.title,variants.product.title,variants.product.categories.name"

const STOCK_LOCATIONS_URL = "/admin/stock-locations?fields=id,name"

/* ============================================================
 * API response shapes (native Medusa endpoints — confirmed against
 * @medusajs/medusa's own admin/inventory-items + admin/stock-locations
 * route handlers).
 * ============================================================ */

type StockLocationApi = {
  id: string
  name: string
}

type LocationLevelApi = {
  location_id: string
  stocked_quantity: number
  reserved_quantity: number
  available_quantity: number
}

type InventoryItemMetadataApi = {
  reorder_level?: number | null
  safety_stock?: number | null
  damaged?: number | null
  incoming?: number | null
} | null

type ItemCategoryApi = { name: string }
type ItemProductApi = { title: string; categories?: ItemCategoryApi[] | null }
type ItemVariantApi = { title: string; product?: ItemProductApi | null }

type InventoryItemApi = {
  id: string
  sku: string | null
  updated_at: string
  metadata: InventoryItemMetadataApi
  location_levels?: LocationLevelApi[] | null
  variants?: ItemVariantApi[] | null
}

/* ============================================================
 * Flattened row model + derived stock status
 * ============================================================ */

type StockStatus = "in" | "low" | "out"

type Row = {
  id: string
  sku: string
  productName: string
  category: string
  variant: string
  warehouseId: string | null
  warehouseName: string
  stocked: number
  reserved: number
  available: number
  incoming: number
  damaged: number
  reorder: number
  safety: number
  status: StockStatus
  updatedAt: string
}

const STATUS_LABEL: Record<StockStatus, string> = {
  in: "In Stock",
  low: "Low Stock",
  out: "Out of Stock",
}

const STATUS_COLOR: Record<StockStatus, "green" | "orange" | "red"> = {
  in: "green",
  low: "orange",
  out: "red",
}

// Subtle row tint for anything that needs attention — same tag classes
// the Badge component itself renders with, so they always match the
// installed @medusajs/ui theme (light + dark).
const STATUS_ROW_TINT: Record<StockStatus, string> = {
  in: "",
  low: "bg-ui-tag-orange-bg",
  out: "bg-ui-tag-red-bg",
}

function deriveStatus(available: number, reorder: number): StockStatus {
  if (available <= 0) return "out"
  if (available <= reorder) return "low"
  return "in"
}

function toRow(
  item: InventoryItemApi,
  locationNameById: Map<string, string>,
): Row {
  const level = item.location_levels?.[0]
  const variant = item.variants?.[0]
  const product = variant?.product
  const meta = item.metadata ?? {}
  const available = level?.available_quantity ?? 0
  const reorder = Number(meta?.reorder_level ?? 0)

  return {
    id: item.id,
    sku: item.sku ?? "—",
    productName: product?.title ?? "—",
    category: product?.categories?.[0]?.name ?? "—",
    variant: variant?.title ?? "—",
    warehouseId: level?.location_id ?? null,
    warehouseName: level?.location_id
      ? locationNameById.get(level.location_id) ?? "—"
      : "—",
    stocked: level?.stocked_quantity ?? 0,
    reserved: level?.reserved_quantity ?? 0,
    available,
    incoming: Number(meta?.incoming ?? 0),
    damaged: Number(meta?.damaged ?? 0),
    reorder,
    safety: Number(meta?.safety_stock ?? 0),
    status: deriveStatus(available, reorder),
    updatedAt: item.updated_at,
  }
}

/* ============================================================
 * Page
 * ============================================================ */

type StatusFilter = "all" | StockStatus

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "in", label: "In Stock" },
  { value: "low", label: "Low Stock" },
  { value: "out", label: "Out of Stock" },
]

const InventoryPage = () => {
  const [items, setItems] = useState<InventoryItemApi[]>([])
  const [locations, setLocations] = useState<StockLocationApi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [warehouseFilter, setWarehouseFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [itemsRes, locationsRes] = await Promise.all([
        fetch(INVENTORY_ITEMS_URL, { credentials: "include" }),
        fetch(STOCK_LOCATIONS_URL, { credentials: "include" }),
      ])
      if (!itemsRes.ok) {
        throw new Error(`Failed to load inventory items (${itemsRes.status})`)
      }
      if (!locationsRes.ok) {
        throw new Error(
          `Failed to load stock locations (${locationsRes.status})`,
        )
      }
      const itemsBody = await itemsRes.json()
      const locationsBody = await locationsRes.json()
      setItems(itemsBody.inventory_items ?? [])
      setLocations(locationsBody.stock_locations ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const locationNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const loc of locations) map.set(loc.id, loc.name)
    return map
  }, [locations])

  const rows = useMemo(
    () => items.map((item) => toRow(item, locationNameById)),
    [items, locationNameById],
  )

  const summary = useMemo(() => {
    const distinctProducts = new Set(
      rows.map((r) => r.productName).filter((name) => name !== "—"),
    )
    return {
      totalProducts: distinctProducts.size,
      totalSkus: rows.length,
      totalUnits: rows.reduce((sum, r) => sum + r.stocked, 0),
      low: rows.filter((r) => r.status === "low").length,
      out: rows.filter((r) => r.status === "out").length,
    }
  }, [rows])

  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.category).filter((c) => c !== "—")),
      ).sort((a, b) => a.localeCompare(b)),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter((r) => {
        if (q) {
          const haystack = `${r.sku} ${r.productName} ${r.category}`.toLowerCase()
          if (!haystack.includes(q)) return false
        }
        if (categoryFilter !== "all" && r.category !== categoryFilter) {
          return false
        }
        if (warehouseFilter !== "all" && r.warehouseId !== warehouseFilter) {
          return false
        }
        if (statusFilter !== "all" && r.status !== statusFilter) return false
        return true
      })
      .sort(
        (a, b) =>
          a.productName.localeCompare(b.productName) ||
          a.variant.localeCompare(b.variant) ||
          a.sku.localeCompare(b.sku),
      )
  }, [rows, search, categoryFilter, warehouseFilter, statusFilter])

  return (
    <Container>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <Heading level="h1">Inventory</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Live stock across all warehouses — {rows.length} SKU
            {rows.length === 1 ? "" : "s"} tracked.
          </Text>
        </div>
        <Button
          variant="secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-ui-tag-red-border bg-ui-tag-red-bg px-4 py-3">
          <Text size="small" className="text-ui-tag-red-text">
            {error}
          </Text>
        </div>
      )}

      {/* Summary tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Total Products" value={summary.totalProducts} />
        <StatTile label="Total SKUs" value={summary.totalSkus} />
        <StatTile label="Total Units in Stock" value={summary.totalUnits} />
        <StatTile label="Low Stock" value={summary.low} accent="orange" />
        <StatTile label="Out of Stock" value={summary.out} accent="red" />
      </div>

      {/* Search + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search SKU, product, or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <Select.Trigger className="w-44">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">All categories</Select.Item>
            {categoryOptions.map((c) => (
              <Select.Item key={c} value={c}>
                {c}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <Select.Trigger className="w-44">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">All warehouses</Select.Item>
            {locations.map((loc) => (
              <Select.Item key={loc.id} value={loc.id}>
                {loc.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <Select.Trigger className="w-44">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {STATUS_FILTER_OPTIONS.map((s) => (
              <Select.Item key={s.value} value={s.value}>
                {s.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <Text size="small" className="text-ui-fg-subtle">
          {filteredRows.length} of {rows.length} shown
        </Text>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-ui-border-base">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>SKU</Table.HeaderCell>
              <Table.HeaderCell>Product</Table.HeaderCell>
              <Table.HeaderCell>Category</Table.HeaderCell>
              <Table.HeaderCell>Variant</Table.HeaderCell>
              <Table.HeaderCell>Warehouse</Table.HeaderCell>
              <Table.HeaderCell className="text-right">
                Available
              </Table.HeaderCell>
              <Table.HeaderCell className="text-right">
                Reserved
              </Table.HeaderCell>
              <Table.HeaderCell className="text-right">
                Incoming
              </Table.HeaderCell>
              <Table.HeaderCell className="text-right">
                Damaged
              </Table.HeaderCell>
              <Table.HeaderCell className="text-right">
                Reorder
              </Table.HeaderCell>
              <Table.HeaderCell className="text-right">
                Safety
              </Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Last Updated</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {loading ? (
              <Table.Row>
                <Table.Cell colSpan={13}>
                  <Text size="small" className="text-ui-fg-subtle">
                    Loading inventory…
                  </Text>
                </Table.Cell>
              </Table.Row>
            ) : filteredRows.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={13}>
                  <Text size="small" className="text-ui-fg-subtle">
                    {rows.length === 0
                      ? "No inventory items found."
                      : "No items match the current search/filters."}
                  </Text>
                </Table.Cell>
              </Table.Row>
            ) : (
              filteredRows.map((r) => (
                <Table.Row key={r.id} className={STATUS_ROW_TINT[r.status]}>
                  <Table.Cell className="font-mono text-xs">
                    {r.sku}
                  </Table.Cell>
                  <Table.Cell>{r.productName}</Table.Cell>
                  <Table.Cell>{r.category}</Table.Cell>
                  <Table.Cell>{r.variant}</Table.Cell>
                  <Table.Cell>{r.warehouseName}</Table.Cell>
                  <Table.Cell className="text-right">
                    {r.available}
                  </Table.Cell>
                  <Table.Cell className="text-right">{r.reserved}</Table.Cell>
                  <Table.Cell className="text-right">{r.incoming}</Table.Cell>
                  <Table.Cell className="text-right">{r.damaged}</Table.Cell>
                  <Table.Cell className="text-right">{r.reorder}</Table.Cell>
                  <Table.Cell className="text-right">{r.safety}</Table.Cell>
                  <Table.Cell>
                    <Badge color={STATUS_COLOR[r.status]}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {new Date(r.updatedAt).toLocaleString("en-IN")}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      </div>
    </Container>
  )
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: "orange" | "red"
}) {
  const valueClass =
    accent === "red"
      ? "text-ui-tag-red-text"
      : accent === "orange"
        ? "text-ui-tag-orange-text"
        : "text-ui-fg-base"
  return (
    <div className="rounded-md border border-ui-border-base p-3">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <div className={`mt-1 text-2xl font-semibold ${valueClass}`}>
        {value.toLocaleString("en-IN")}
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Inventory",
  icon: ArchiveBox,
})

export default InventoryPage
