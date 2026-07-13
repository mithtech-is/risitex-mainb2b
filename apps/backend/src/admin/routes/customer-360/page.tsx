import { defineRouteConfig } from "@medusajs/admin-sdk"
import { User } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Table,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import React, { useCallback, useEffect, useState } from "react"

/**
 * Customer 360 (B2B rebuild — Risitex equity/KYC tabs replaced).
 *
 * Search → pick customer → tabbed detail view:
 *
 *   Overview    profile fields + B2B linkage (company, tier, rep,
 *               payment terms)
 *   Company     linked company info (GSTIN, trade name, status)
 *   Wallet      live balance · inline adjust form · transactions
 *               table — matches the depth of Risitex's Wallet tab
 *   Orders      last 10 orders w/ totals + status
 *
 * Tabs render in-place so ops can flip between them without
 * losing scroll position, mirroring the Risitex pattern.
 */

type Customer = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  has_account: boolean
  created_at: string
  company_id?: string | null
  customer_tier_id?: string | null
  payment_terms?: string | null
  metadata?: Record<string, unknown>
}

type Company = {
  id: string
  gstin: string
  trade_name: string
  status: string
  customer_tier_id: string | null
}

type Wallet = {
  balance_inr: number
  promo_balance_inr: number
  is_frozen: boolean
  transactions: Array<{
    id: string
    direction: "credit" | "debit"
    amount_inr: number
    balance_after: number
    kind: string
    bucket: "main" | "promo"
    note: string | null
    created_at: string
  }>
}

type Order = {
  id: string
  display_id: number
  total: number
  currency_code: string
  status: string
  created_at: string
}

type Tab = "overview" | "company" | "wallet" | "orders"

const Customer360Page = () => {
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Customer[]>([])
  const [cust, setCust] = useState<Customer | null>(null)
  const [tab, setTab] = useState<Tab>("overview")

  const search = useCallback(async () => {
    if (!q.trim()) return
    setBusy(true)
    try {
      const r = await fetch(
        `/admin/customers?q=${encodeURIComponent(q.trim())}&limit=10&fields=*metadata`,
        { credentials: "include" },
      ).then((x) => x.json())
      setResults(r.customers ?? [])
    } catch {
      toast.error("Search failed")
    } finally {
      setBusy(false)
    }
  }, [q])

  const pick = (c: Customer) => {
    setCust(c)
    setResults([])
    setTab("overview")
  }

  const reset = () => {
    setCust(null)
    setQ("")
    setResults([])
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Customer 360</Heading>
          <Text className="text-ui-fg-subtle">
            Profile · company · wallet · orders
          </Text>
        </div>
        {cust && (
          <Button variant="secondary" size="small" onClick={reset}>
            Switch customer
          </Button>
        )}
      </div>

      {!cust && (
        <div className="flex flex-col gap-3 px-6 py-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search customer by email (partial OK)"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
            />
            <Button onClick={() => void search()} disabled={busy}>
              Search
            </Button>
          </div>
          {results.length > 0 && (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Email</Table.HeaderCell>
                  <Table.HeaderCell>Name</Table.HeaderCell>
                  <Table.HeaderCell>Account</Table.HeaderCell>
                  <Table.HeaderCell></Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {results.map((c) => (
                  <Table.Row key={c.id}>
                    <Table.Cell>{c.email}</Table.Cell>
                    <Table.Cell>
                      {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={c.has_account ? "green" : "grey"}>
                        {c.has_account ? "Registered" : "Guest"}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Button size="small" onClick={() => pick(c)}>
                        Open
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </div>
      )}

      {cust && (
        <>
          <div className="flex flex-wrap items-center gap-3 px-6 py-3">
            <Text className="font-medium">{cust.email}</Text>
            <Text className="text-ui-fg-subtle">
              {[cust.first_name, cust.last_name].filter(Boolean).join(" ") ||
                "—"}
            </Text>
            {cust.company_id && (
              <Badge color="blue">company {cust.company_id}</Badge>
            )}
          </div>
          <div className="flex gap-2 px-6 py-2">
            {(
              [
                ["overview", "Overview"],
                ["company", "Company"],
                ["wallet", "Wallet"],
                ["orders", "Orders"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                size="small"
                variant={tab === key ? "primary" : "transparent"}
                onClick={() => setTab(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="px-6 py-4">
            {tab === "overview" && <OverviewTab c={cust} />}
            {tab === "company" && <CompanyTab c={cust} />}
            {tab === "wallet" && <WalletTab c={cust} />}
            {tab === "orders" && <OrdersTab c={cust} />}
          </div>
        </>
      )}
    </Container>
  )
}

/* ───────────────── Overview ───────────────── */

function OverviewTab({ c }: { c: Customer }) {
  const m = c.metadata ?? {}
  return (
    <div className="space-y-2">
      <Row label="Customer id" value={<code>{c.id}</code>} />
      <Row label="Email" value={c.email} />
      <Row
        label="Name"
        value={
          [c.first_name, c.last_name].filter(Boolean).join(" ") || "—"
        }
      />
      <Row label="Phone" value={c.phone ?? "—"} />
      <Row label="Created" value={new Date(c.created_at).toLocaleString()} />
      <Row
        label="Account"
        value={
          <Badge color={c.has_account ? "green" : "grey"}>
            {c.has_account ? "Registered" : "Guest"}
          </Badge>
        }
      />
      <Row label="Company Name" value={(m.company_name as string) ?? "—"} />
      <Row label="GSTIN" value={(m.gstin as string) ?? "—"} />
      <Row label="Business Type" value={(m.business_type as string) ?? "—"} />
      <Row label="Owner" value={(m.owner_name as string) ?? "—"} />
      <Row label="Address" value={(m.address as string) ?? "—"} />
      <Row label="City" value={(m.city as string) ?? "—"} />
      <Row label="State" value={(m.state as string) ?? "—"} />
      <Row label="Pincode" value={(m.pincode as string) ?? "—"} />
    </div>
  )
}

/* ───────────────── Company ───────────────── */

function CompanyTab({ c }: { c: Customer }) {
  const [co, setCo] = useState<Company | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!c.company_id) return
    setLoading(true)
    fetch(`/admin/companies/${c.company_id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setCo(j.company))
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [c.company_id])

  if (!c.company_id) {
    const m = c.metadata ?? {}
    const companyName = m.company_name as string | undefined
    const gstin = m.gstin as string | undefined
    if (companyName || gstin) {
      return (
        <div className="space-y-2">
          <Row label="Company Name" value={companyName ?? "—"} />
          <Row label="GSTIN" value={gstin ?? "—"} />
          <Row label="Business Type" value={(m.business_type as string) ?? "—"} />
          <Row label="Owner" value={(m.owner_name as string) ?? "—"} />
          <Row label="Address" value={(m.address as string) ?? "—"} />
          <Row label="City" value={(m.city as string) ?? "—"} />
          <Row label="State" value={(m.state as string) ?? "—"} />
          <Row label="Pincode" value={(m.pincode as string) ?? "—"} />
          <Row label="Trade License" value={(m.trade_license as string) ?? "—"} />
          <Row label="Status" value={<Badge color="orange">Application pending</Badge>} />
        </div>
      )
    }
    return (
      <Text className="text-ui-fg-subtle">
        No company information provided.
      </Text>
    )
  }
  if (loading) return <Text>Loading company…</Text>
  if (!co)
    return (
      <Text className="text-ui-fg-subtle">
        Company {c.company_id} not found.
      </Text>
    )

  return (
    <div className="space-y-2">
      <Row label="Company id" value={<code>{co.id}</code>} />
      <Row label="GSTIN" value={<code>{co.gstin}</code>} />
      <Row label="Trade name" value={co.trade_name} />
      <Row label="Status" value={<Badge>{co.status}</Badge>} />
      <Row label="Tier id" value={co.customer_tier_id ?? "—"} />
      <Button
        size="small"
        variant="secondary"
        onClick={() => (location.href = "/app/companies")}
      >
        Open Companies admin
      </Button>
    </div>
  )
}

/* ───────────────── Wallet ───────────────── */

const REASON_CODES = [
  { value: "promo", label: "Promotion / campaign" },
  { value: "goodwill", label: "Goodwill (CS comp)" },
  { value: "reconciliation", label: "Reconciliation" },
  { value: "correction", label: "Correction" },
  { value: "other", label: "Other" },
] as const

function WalletTab({ c }: { c: Customer }) {
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  // adjust form
  const [direction, setDirection] = useState<"credit" | "debit">("credit")
  const [bucket, setBucket] = useState<"main" | "promo">("main")
  const [amount, setAmount] = useState("")
  const [reasonCode, setReasonCode] = useState<typeof REASON_CODES[number]["value"]>("goodwill")
  const [note, setNote] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const j = await fetch(`/admin/wallets/${c.id}`, {
        credentials: "include",
      }).then((r) => r.json())
      setWallet(j as Wallet)
    } catch {
      toast.error("Could not load wallet")
    } finally {
      setLoading(false)
    }
  }, [c.id])
  useEffect(() => {
    void load()
  }, [load])

  const adjust = async () => {
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Amount must be a positive integer (in paise)")
      return
    }
    if (note.trim().length < 20) {
      toast.error("Note must be ≥ 20 chars (audit log requirement)")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/admin/wallets/${c.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          direction,
          amount_inr: Math.round(amt),
          reason_code: reasonCode,
          bucket,
          note,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message ?? `${res.status}`)
      }
      toast.success(`Wallet ${direction}ed`)
      setAmount("")
      setNote("")
      await load()
    } catch (err) {
      toast.error((err as Error).message ?? "Adjust failed")
    } finally {
      setBusy(false)
    }
  }

  const toggleFreeze = async () => {
    if (!wallet) return
    setBusy(true)
    try {
      const res = await fetch(`/admin/wallets/${c.id}/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: wallet.is_frozen ? "unfreeze" : "freeze",
          note: note || "Customer 360 console",
        }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      toast.success(wallet.is_frozen ? "Unfrozen" : "Frozen")
      await load()
    } catch {
      toast.error("Action failed")
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Text>Loading wallet…</Text>
  if (!wallet) return <Text>No wallet data</Text>

  return (
    <div className="space-y-6">
      {/* ── Balance cards ── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat
          title="Main balance"
          value={`₹${(wallet.balance_inr / 100).toFixed(2)}`}
          hint="Withdrawable · NEFT / IMPS funded"
        />
        <Stat
          title="Promo balance"
          value={`₹${(wallet.promo_balance_inr / 100).toFixed(2)}`}
          hint="Non-withdrawable · checkout-only credits"
        />
        <div className="flex flex-col gap-2 rounded-md border border-ui-border-base p-3">
          <Text className="text-ui-fg-subtle">Status</Text>
          <Badge color={wallet.is_frozen ? "red" : "green"}>
            {wallet.is_frozen ? "frozen" : "active"}
          </Badge>
          <Button
            variant={wallet.is_frozen ? "primary" : "danger"}
            size="small"
            onClick={() => void toggleFreeze()}
            disabled={busy}
          >
            {wallet.is_frozen ? "Unfreeze" : "Freeze wallet"}
          </Button>
        </div>
      </div>

      {/* ── Adjust form ── */}
      <div className="rounded-md border border-ui-border-base p-4">
        <Heading level="h3">Manual adjustment</Heading>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Bucket">
            <Select
              value={bucket}
              onValueChange={(v) => setBucket(v as "main" | "promo")}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="main">Main</Select.Item>
                <Select.Item value="promo">Promo</Select.Item>
              </Select.Content>
            </Select>
          </Field>
          <Field label="Direction">
            <Select
              value={direction}
              onValueChange={(v) => setDirection(v as "credit" | "debit")}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="credit">Credit (+)</Select.Item>
                <Select.Item value="debit">Debit (−)</Select.Item>
              </Select.Content>
            </Select>
          </Field>
          <Field label="Amount (paise)">
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
              placeholder="e.g. 50000 = ₹500"
            />
          </Field>
          <Field label="Reason code">
            <Select
              value={reasonCode}
              onValueChange={(v) =>
                setReasonCode(v as typeof reasonCode)
              }
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {REASON_CODES.map((r) => (
                  <Select.Item key={r.value} value={r.value}>
                    {r.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Note (min 20 chars, required)">
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              placeholder="Detailed audit-friendly explanation of the adjustment."
            />
          </Field>
        </div>
        <div className="mt-3">
          <Button onClick={adjust} disabled={busy}>
            Apply adjustment
          </Button>
        </div>
      </div>

      {/* ── Transactions ── */}
      <div className="rounded-md border border-ui-border-base p-4">
        <Heading level="h3">
          Transactions ({wallet.transactions?.length ?? 0})
        </Heading>
        <Table className="mt-3">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>When</Table.HeaderCell>
              <Table.HeaderCell>Kind</Table.HeaderCell>
              <Table.HeaderCell>Bucket</Table.HeaderCell>
              <Table.HeaderCell>Dir</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Balance after</Table.HeaderCell>
              <Table.HeaderCell>Note</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(wallet.transactions ?? []).slice(0, 50).map((t) => (
              <Table.Row key={t.id}>
                <Table.Cell>
                  {new Date(t.created_at).toLocaleString()}
                </Table.Cell>
                <Table.Cell>{t.kind}</Table.Cell>
                <Table.Cell>
                  <Badge>{t.bucket}</Badge>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={t.direction === "credit" ? "green" : "red"}>
                    {t.direction === "credit" ? "+" : "−"}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  ₹{(t.amount_inr / 100).toFixed(2)}
                </Table.Cell>
                <Table.Cell>
                  ₹{(t.balance_after / 100).toFixed(2)}
                  <div className="text-xs text-ui-fg-subtle">
                    {t.bucket} bucket
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Text className="text-xs">{t.note ?? "—"}</Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
    </div>
  )
}

/* ───────────────── Orders ───────────────── */

function OrdersTab({ c }: { c: Customer }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    fetch(`/admin/orders?customer_id=${c.id}&limit=20`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((j) => setOrders(j.orders ?? []))
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [c.id])
  if (loading) return <Text>Loading orders…</Text>
  if (orders.length === 0)
    return (
      <Text className="text-ui-fg-subtle">No orders for this customer.</Text>
    )
  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>#</Table.HeaderCell>
          <Table.HeaderCell>Total</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell>Placed</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {orders.map((o) => (
          <Table.Row key={o.id}>
            <Table.Cell>{o.display_id ?? o.id}</Table.Cell>
            <Table.Cell>
              {o.currency_code?.toUpperCase()}{" "}
              {(Number(o.total) / 100).toFixed(2)}
            </Table.Cell>
            <Table.Cell>
              <Badge>{o.status}</Badge>
            </Table.Cell>
            <Table.Cell>
              {new Date(o.created_at).toLocaleString()}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
}

/* ───────────────── helpers ───────────────── */

function Row({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Text className="text-ui-fg-subtle">{label}</Text>
      <div className="col-span-2">{value}</div>
    </div>
  )
}

function Stat({
  title,
  value,
  hint,
}: {
  title: string
  value: React.ReactNode
  hint: string
}) {
  return (
    <div className="rounded-md border border-ui-border-base p-3">
      <Text className="text-ui-fg-subtle">{title}</Text>
      <div className="mt-1 text-lg font-medium">{value}</div>
      <Text className="text-ui-fg-subtle text-xs">{hint}</Text>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Customer 360",
  icon: User,
  // `nested: "/customers"` makes the entry appear as a sub-item
  // inside the Customers section of the admin sidebar (below the
  // built-in Customers / Customer Groups links) instead of as a
  // top-level nav. The route URL stays `/app/customer-360`; only
  // the sidebar grouping changes.
  nested: "/customers",
})

export default Customer360Page
