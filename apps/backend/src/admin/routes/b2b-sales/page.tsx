import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar, Plus, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import React, { useCallback, useEffect, useState } from "react"

/**
 * B2B Sales admin — the single management surface for the b2b_pricing
 * engine: tier/volume price ladders, MOQ/step rules, and the server-side
 * wholesale-catalog visibility gate. (Two-domain consolidation: this is the
 * "B2B Sales" domain section.)
 */

const BASE = "/admin/b2b-sales"

type Tier = { id: string; code: string; name: string }
type PriceTier = {
  id: string
  product_id: string | null
  category_id: string | null
  customer_tier_id: string | null
  region_id: string | null
  min_quantity: number
  max_quantity: number | null
  value: number
  is_percentage: boolean
}
type QtyRule = {
  id: string
  product_id: string
  customer_tier_id: string | null
  min_qty: number | null
  max_qty: number | null
  step_qty: number | null
}
type VisRule = {
  id: string
  target_type: "product" | "category"
  product_id: string | null
  category_id: string | null
  customer_tier_id: string | null
  visible: boolean
  mode: "follow_category" | "manual"
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error((j as any).message ?? `${res.status}`)
  }
  return res.json()
}

// ── Shared pickers ──────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label size="small">{label}</Label>
      {children}
    </div>
  )
}

function ProductPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (id: string | null, title?: string) => void
}) {
  const [q, setQ] = useState("")
  const [opts, setOpts] = useState<{ id: string; title: string }[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!q || q.length < 2) {
      setOpts([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const j = await api(
          `/admin/products?q=${encodeURIComponent(q)}&limit=8&fields=id,title`,
        )
        setOpts((j.products ?? []).map((p: any) => ({ id: p.id, title: p.title })))
        setOpen(true)
      } catch {
        /* ignore search errors */
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="relative">
      <Input
        value={q}
        placeholder={value ? value : "Search a product… (blank = global)"}
        onChange={(e) => {
          setQ(e.currentTarget.value)
          if (!e.currentTarget.value) onChange(null)
        }}
      />
      {open && opts.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border bg-ui-bg-base shadow-lg">
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-ui-bg-base-hover"
              onClick={() => {
                onChange(o.id, o.title)
                setQ(o.title)
                setOpen(false)
              }}
            >
              {o.title}
              <span className="ml-2 font-mono text-xs text-ui-fg-muted">
                {o.id.slice(0, 14)}…
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TierSelect({
  tiers,
  value,
  onChange,
}: {
  tiers: Tier[]
  value: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <Select
      value={value ?? "__all"}
      onValueChange={(v) => onChange(v === "__all" ? null : v)}
    >
      <Select.Trigger>
        <Select.Value placeholder="All buyers (default)" />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="__all">All buyers (default ladder)</Select.Item>
        {tiers.map((t) => (
          <Select.Item key={t.id} value={t.id}>
            {t.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  )
}

function tierName(tiers: Tier[], id: string | null) {
  if (!id) return "All"
  return tiers.find((t) => t.id === id)?.name ?? id.slice(0, 10)
}
function scopeLabel(r: { product_id: string | null; category_id: string | null }) {
  if (r.product_id) return "Product"
  if (r.category_id) return "Category"
  return "Global"
}

// ── Tab: Price Tiers ────────────────────────────────────────────────

function PriceTiersTab({ tiers }: { tiers: Tier[] }) {
  const [rows, setRows] = useState<PriceTier[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const j = await api(`${BASE}/price-tiers`)
      setRows(j.price_tiers ?? [])
    } catch {
      toast.error("Failed to load price tiers")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const remove = async (id: string) => {
    try {
      await api(`${BASE}/price-tiers/${id}`, { method: "DELETE" })
      toast.success("Deleted")
      void load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="small" onClick={() => setAdding(true)}>
          <Plus /> Add price tier
        </Button>
      </div>
      {loading ? (
        <Text>Loading…</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Scope</Table.HeaderCell>
              <Table.HeaderCell>Buyer tier</Table.HeaderCell>
              <Table.HeaderCell>Qty</Table.HeaderCell>
              <Table.HeaderCell>Price</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>
                  <Badge size="2xsmall">{scopeLabel(r)}</Badge>
                  {r.product_id && (
                    <span className="ml-1 font-mono text-xs text-ui-fg-muted">
                      {r.product_id.slice(0, 12)}…
                    </span>
                  )}
                </Table.Cell>
                <Table.Cell>{tierName(tiers, r.customer_tier_id)}</Table.Cell>
                <Table.Cell>
                  {r.min_quantity}
                  {r.max_quantity ? `–${r.max_quantity}` : "+"}
                </Table.Cell>
                <Table.Cell>
                  {r.is_percentage ? `${r.value}%` : `₹${r.value / 100}`}
                </Table.Cell>
                <Table.Cell>
                  <Button
                    size="small"
                    variant="transparent"
                    onClick={() => void remove(r.id)}
                  >
                    <Trash />
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
            {rows.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <Text className="text-ui-fg-subtle">No price tiers yet.</Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      )}
      {adding && (
        <PriceTierDrawer
          tiers={tiers}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function PriceTierDrawer({
  tiers,
  onClose,
  onSaved,
}: {
  tiers: Tier[]
  onClose: () => void
  onSaved: () => void
}) {
  const [productId, setProductId] = useState<string | null>(null)
  const [tierId, setTierId] = useState<string | null>(null)
  const [minQ, setMinQ] = useState(1)
  const [maxQ, setMaxQ] = useState<string>("")
  const [pct, setPct] = useState(false)
  const [amount, setAmount] = useState<string>("")
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const value = pct ? Number(amount) : Math.round(Number(amount) * 100)
      await api(`${BASE}/price-tiers`, {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          customer_tier_id: tierId,
          min_quantity: Number(minQ),
          max_quantity: maxQ ? Number(maxQ) : null,
          value,
          is_percentage: pct,
        }),
      })
      toast.success("Price tier added")
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer title="New price tier" onClose={onClose}>
      <Field label="Product (blank = global ladder)">
        <ProductPicker value={productId} onChange={(id) => setProductId(id)} />
      </Field>
      <Field label="Buyer tier">
        <TierSelect tiers={tiers} value={tierId} onChange={setTierId} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Min qty">
          <Input
            type="number"
            value={minQ}
            onChange={(e) => setMinQ(Number(e.currentTarget.value))}
          />
        </Field>
        <Field label="Max qty (blank = ∞)">
          <Input
            type="number"
            value={maxQ}
            onChange={(e) => setMaxQ(e.currentTarget.value)}
          />
        </Field>
      </div>
      <Field label={pct ? "Discount %" : "Unit price (₹)"}>
        <Input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.currentTarget.value)}
          placeholder={pct ? "e.g. 10" : "e.g. 179"}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Switch checked={pct} onCheckedChange={(v) => setPct(!!v)} />
        <Label size="small">Value is a percentage discount</Label>
      </div>
      <DrawerActions busy={busy} onSave={save} onClose={onClose} />
    </Drawer>
  )
}

// ── Tab: MOQ rules ──────────────────────────────────────────────────

function MoqTab({ tiers }: { tiers: Tier[] }) {
  const [rows, setRows] = useState<QtyRule[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const j = await api(`${BASE}/quantity-rules`)
      setRows(j.quantity_rules ?? [])
    } catch {
      toast.error("Failed to load MOQ rules")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const remove = async (id: string) => {
    try {
      await api(`${BASE}/quantity-rules/${id}`, { method: "DELETE" })
      toast.success("Deleted")
      void load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="small" onClick={() => setAdding(true)}>
          <Plus /> Add MOQ rule
        </Button>
      </div>
      {loading ? (
        <Text>Loading…</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Product</Table.HeaderCell>
              <Table.HeaderCell>Buyer tier</Table.HeaderCell>
              <Table.HeaderCell>Min</Table.HeaderCell>
              <Table.HeaderCell>Max</Table.HeaderCell>
              <Table.HeaderCell>Step</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell className="font-mono text-xs">
                  {r.product_id.slice(0, 16)}…
                </Table.Cell>
                <Table.Cell>{tierName(tiers, r.customer_tier_id)}</Table.Cell>
                <Table.Cell>{r.min_qty ?? "—"}</Table.Cell>
                <Table.Cell>{r.max_qty ?? "—"}</Table.Cell>
                <Table.Cell>{r.step_qty ?? "—"}</Table.Cell>
                <Table.Cell>
                  <Button
                    size="small"
                    variant="transparent"
                    onClick={() => void remove(r.id)}
                  >
                    <Trash />
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
            {rows.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={6}>
                  <Text className="text-ui-fg-subtle">No MOQ rules yet.</Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      )}
      {adding && (
        <MoqDrawer
          tiers={tiers}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function MoqDrawer({
  tiers,
  onClose,
  onSaved,
}: {
  tiers: Tier[]
  onClose: () => void
  onSaved: () => void
}) {
  const [productId, setProductId] = useState<string | null>(null)
  const [tierId, setTierId] = useState<string | null>(null)
  const [minQ, setMinQ] = useState<string>("")
  const [maxQ, setMaxQ] = useState<string>("")
  const [stepQ, setStepQ] = useState<string>("")
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!productId) {
      toast.error("Pick a product")
      return
    }
    setBusy(true)
    try {
      await api(`${BASE}/quantity-rules`, {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          customer_tier_id: tierId,
          min_qty: minQ ? Number(minQ) : null,
          max_qty: maxQ ? Number(maxQ) : null,
          step_qty: stepQ ? Number(stepQ) : null,
        }),
      })
      toast.success("MOQ rule added")
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer title="New MOQ / step rule" onClose={onClose}>
      <Field label="Product (required)">
        <ProductPicker value={productId} onChange={(id) => setProductId(id)} />
      </Field>
      <Field label="Buyer tier">
        <TierSelect tiers={tiers} value={tierId} onChange={setTierId} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Min qty">
          <Input
            type="number"
            value={minQ}
            onChange={(e) => setMinQ(e.currentTarget.value)}
          />
        </Field>
        <Field label="Max qty">
          <Input
            type="number"
            value={maxQ}
            onChange={(e) => setMaxQ(e.currentTarget.value)}
          />
        </Field>
        <Field label="Step (carton)">
          <Input
            type="number"
            value={stepQ}
            onChange={(e) => setStepQ(e.currentTarget.value)}
          />
        </Field>
      </div>
      <DrawerActions busy={busy} onSave={save} onClose={onClose} />
    </Drawer>
  )
}

// ── Tab: Visibility ─────────────────────────────────────────────────

function VisibilityTab({ tiers }: { tiers: Tier[] }) {
  const [rows, setRows] = useState<VisRule[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const j = await api(`${BASE}/visibility-rules`)
      setRows(j.visibility_rules ?? [])
    } catch {
      toast.error("Failed to load visibility rules")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const remove = async (id: string) => {
    try {
      await api(`${BASE}/visibility-rules/${id}`, { method: "DELETE" })
      toast.success("Deleted")
      void load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="small" onClick={() => setAdding(true)}>
          <Plus /> Add visibility rule
        </Button>
      </div>
      {loading ? (
        <Text>Loading…</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Target</Table.HeaderCell>
              <Table.HeaderCell>Buyer tier</Table.HeaderCell>
              <Table.HeaderCell>Visible</Table.HeaderCell>
              <Table.HeaderCell>Mode</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>
                  <Badge size="2xsmall">{r.target_type}</Badge>
                  <span className="ml-1 font-mono text-xs text-ui-fg-muted">
                    {(r.product_id ?? r.category_id ?? "").slice(0, 12)}…
                  </span>
                </Table.Cell>
                <Table.Cell>{tierName(tiers, r.customer_tier_id)}</Table.Cell>
                <Table.Cell>
                  <Badge color={r.visible ? "green" : "red"} size="2xsmall">
                    {r.visible ? "visible" : "hidden"}
                  </Badge>
                </Table.Cell>
                <Table.Cell>{r.mode}</Table.Cell>
                <Table.Cell>
                  <Button
                    size="small"
                    variant="transparent"
                    onClick={() => void remove(r.id)}
                  >
                    <Trash />
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
            {rows.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <Text className="text-ui-fg-subtle">
                    No visibility rules — all products visible to everyone.
                  </Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      )}
      {adding && (
        <VisibilityDrawer
          tiers={tiers}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function VisibilityDrawer({
  tiers,
  onClose,
  onSaved,
}: {
  tiers: Tier[]
  onClose: () => void
  onSaved: () => void
}) {
  const [targetType, setTargetType] = useState<"product" | "category">("product")
  const [productId, setProductId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState("")
  const [tierId, setTierId] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (targetType === "product" && !productId) {
      toast.error("Pick a product")
      return
    }
    if (targetType === "category" && !categoryId) {
      toast.error("Enter a category id")
      return
    }
    setBusy(true)
    try {
      await api(`${BASE}/visibility-rules`, {
        method: "POST",
        body: JSON.stringify({
          target_type: targetType,
          product_id: targetType === "product" ? productId : null,
          category_id: targetType === "category" ? categoryId : null,
          customer_tier_id: tierId,
          visible,
          mode: "manual",
        }),
      })
      toast.success("Visibility rule added")
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer title="New visibility rule" onClose={onClose}>
      <Field label="Target type">
        <Select
          value={targetType}
          onValueChange={(v) => setTargetType(v as "product" | "category")}
        >
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="product">Product</Select.Item>
            <Select.Item value="category">Category</Select.Item>
          </Select.Content>
        </Select>
      </Field>
      {targetType === "product" ? (
        <Field label="Product">
          <ProductPicker value={productId} onChange={(id) => setProductId(id)} />
        </Field>
      ) : (
        <Field label="Category id">
          <Input
            value={categoryId}
            onChange={(e) => setCategoryId(e.currentTarget.value)}
            placeholder="pcat_…"
          />
        </Field>
      )}
      <Field label="Buyer tier (blank = applies to everyone)">
        <TierSelect tiers={tiers} value={tierId} onChange={setTierId} />
      </Field>
      <div className="flex items-center gap-2">
        <Switch checked={visible} onCheckedChange={(v) => setVisible(!!v)} />
        <Label size="small">
          {visible ? "Visible to this audience" : "Hidden from this audience"}
        </Label>
      </div>
      <DrawerActions busy={busy} onSave={save} onClose={onClose} />
    </Drawer>
  )
}

// ── Drawer shell ────────────────────────────────────────────────────

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-ui-bg-base p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <Heading level="h2">{title}</Heading>
        <div className="mt-4 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function DrawerActions({
  busy,
  onSave,
  onClose,
}: {
  busy: boolean
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div className="flex gap-2 pt-3">
      <Button onClick={onSave} disabled={busy}>
        Create
      </Button>
      <Button variant="secondary" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────

const TABS = [
  { key: "tiers", label: "Price Tiers" },
  { key: "moq", label: "MOQ Rules" },
  { key: "visibility", label: "Visibility" },
] as const

const B2BSalesPage = () => {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("tiers")
  const [tiers, setTiers] = useState<Tier[]>([])

  useEffect(() => {
    void (async () => {
      try {
        const j = await api(`/admin/customer-tiers`)
        setTiers(j.customer_tiers ?? [])
      } catch {
        /* tiers optional — pickers just show "All" */
      }
    })()
  }, [])

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">B2B Sales</Heading>
        <Text className="text-ui-fg-subtle">
          Tier / volume pricing · MOQ &amp; carton-step rules · wholesale
          visibility gate
        </Text>
      </div>
      <div className="flex gap-1 px-6 py-3">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="small"
            variant={tab === t.key ? "primary" : "secondary"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <div className="px-6 py-4">
        {tab === "tiers" && <PriceTiersTab tiers={tiers} />}
        {tab === "moq" && <MoqTab tiers={tiers} />}
        {tab === "visibility" && <VisibilityTab tiers={tiers} />}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "B2B Sales",
  icon: CurrencyDollar,
})

export default B2BSalesPage
