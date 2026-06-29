import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
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
  toast,
} from "@medusajs/ui"
import React, { useCallback, useEffect, useState } from "react"

/**
 * Wallet — operational console (Risitex-parity tabbed layout).
 *
 * Three tabs:
 *   Held orders    — PaymentAttempts in `held` state (insufficient wallet
 *                    at checkout time, awaiting top-up). Backed by
 *                    GET /admin/held-orders + POST /admin/held-orders/:id/cancel
 *   Customer wallet — search → customer balance + adjust + transactions.
 *                    Backed by GET/POST /admin/wallets/:customer_id*.
 *   Webhook events — payment-channel webhook audit log (Razorpay /
 *                    Cashfree). Backed by GET /admin/webhook-events.
 *
 * Each tab fetches on first activation and caches in component state;
 * the Refresh button re-runs the query.
 */

type Tab = "held" | "wallet" | "deposits" | "webhooks"

const WalletsPage = () => {
  const [tab, setTab] = useState<Tab>("deposits")
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Wallet</Heading>
        <Text className="text-ui-fg-subtle">
          Operational view — pending deposit-proof approvals, held
          orders, customer wallets, and Razorpay / Cashfree webhook
          events. Provider credentials are configured on the separate
          <strong> Cashfree</strong> page.
        </Text>
      </div>
      <div className="flex flex-wrap gap-2 px-6 py-3">
        <TabBtn active={tab === "deposits"} onClick={() => setTab("deposits")}>
          Deposit proofs
        </TabBtn>
        <TabBtn active={tab === "held"} onClick={() => setTab("held")}>
          Held orders
        </TabBtn>
        <TabBtn active={tab === "wallet"} onClick={() => setTab("wallet")}>
          Customer wallet
        </TabBtn>
        <TabBtn active={tab === "webhooks"} onClick={() => setTab("webhooks")}>
          Webhook events
        </TabBtn>
      </div>
      <div className="px-6 py-4">
        {tab === "deposits" && <DepositProofsTab />}
        {tab === "held" && <HeldOrdersTab />}
        {tab === "wallet" && <CustomerWalletTab />}
        {tab === "webhooks" && <WebhookEventsTab />}
      </div>
    </Container>
  )
}

/* ───────────────── Held orders ───────────────── */

type HeldOrder = {
  id: string
  cart_id: string | null
  customer_id: string
  amount_inr: number
  wallet_balance_at_init: number
  shortfall_inr: number
  status: string
  created_at: string
}

function HeldOrdersTab() {
  const [rows, setRows] = useState<HeldOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<"held" | "all" | "captured" | "cancelled">("held")
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/admin/held-orders?status=${status}&limit=100`, {
        credentials: "include",
      }).then((x) => x.json())
      setRows(r.held_orders ?? [])
    } catch {
      toast.error("Could not load held orders")
    } finally {
      setLoading(false)
    }
  }, [status])
  useEffect(() => {
    void load()
  }, [load])

  const cancel = async (id: string) => {
    if (!window.confirm("Cancel this held order? The customer's wallet hold (if any) will be released.")) return
    setBusyId(id)
    try {
      const r = await fetch(`/admin/held-orders/${id}/cancel`, {
        method: "POST",
        credentials: "include",
      })
      if (!r.ok) throw new Error(`${r.status}`)
      toast.success("Held order cancelled")
      await load()
    } catch (err) {
      toast.error((err as Error).message ?? "Cancel failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Field label="Status">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as typeof status)}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="held">Held</Select.Item>
              <Select.Item value="captured">Captured</Select.Item>
              <Select.Item value="cancelled">Cancelled</Select.Item>
              <Select.Item value="all">All</Select.Item>
            </Select.Content>
          </Select>
        </Field>
        <Button variant="secondary" size="small" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {loading ? (
        <Text>Loading…</Text>
      ) : rows.length === 0 ? (
        <Text className="text-ui-fg-subtle">
          No {status === "all" ? "" : status} orders.
        </Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>When</Table.HeaderCell>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Cart</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Balance @init</Table.HeaderCell>
              <Table.HeaderCell>Shortfall</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell></Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>{new Date(r.created_at).toLocaleString()}</Table.Cell>
                <Table.Cell>
                  <code className="text-xs">{r.customer_id}</code>
                </Table.Cell>
                <Table.Cell>
                  <code className="text-xs">{r.cart_id ?? "—"}</code>
                </Table.Cell>
                <Table.Cell>₹{(r.amount_inr / 100).toFixed(2)}</Table.Cell>
                <Table.Cell>
                  ₹{(r.wallet_balance_at_init / 100).toFixed(2)}
                </Table.Cell>
                <Table.Cell>
                  {r.shortfall_inr > 0 ? (
                    <Badge color="orange">
                      ₹{(r.shortfall_inr / 100).toFixed(2)}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Badge color={statusColor(r.status)}>{r.status}</Badge>
                </Table.Cell>
                <Table.Cell>
                  {r.status === "held" && (
                    <Button
                      size="small"
                      variant="danger"
                      onClick={() => void cancel(r.id)}
                      disabled={busyId === r.id}
                    >
                      Cancel
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </div>
  )
}

function statusColor(s: string): "green" | "orange" | "red" | "grey" {
  if (s === "captured" || s === "debited") return "green"
  if (s === "held" || s === "initiated") return "orange"
  if (s === "cancelled") return "red"
  return "grey"
}

/* ───────────────── Customer wallet ───────────────── */

type Customer = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  company_id?: string | null
}

type Summary = {
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

function CustomerWalletTab() {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Customer[]>([])
  const [picked, setPicked] = useState<Customer | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)

  const [direction, setDirection] = useState<"credit" | "debit">("credit")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState<
    "promo" | "goodwill" | "reconciliation" | "correction" | "other"
  >("goodwill")
  const [bucket, setBucket] = useState<"main" | "promo">("main")
  const [note, setNote] = useState("")

  const search = useCallback(async () => {
    if (!q.trim()) return
    setBusy(true)
    try {
      const r = await fetch(
        `/admin/customers?q=${encodeURIComponent(q.trim())}&limit=10`,
        { credentials: "include" },
      ).then((x) => x.json())
      setResults(r.customers ?? [])
      if ((r.customers ?? []).length === 0) toast.info("No customer matched")
    } catch {
      toast.error("Search failed")
    } finally {
      setBusy(false)
    }
  }, [q])

  const loadSummary = useCallback(async (c: Customer) => {
    setBusy(true)
    try {
      const r = await fetch(`/admin/wallets/${c.id}`, {
        credentials: "include",
      }).then((x) => x.json())
      setSummary(r as Summary)
    } catch {
      toast.error("Could not load wallet")
    } finally {
      setBusy(false)
    }
  }, [])

  const pick = (c: Customer) => {
    setPicked(c)
    setResults([])
    void loadSummary(c)
  }

  const adjust = async () => {
    if (!picked) return
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Amount must be a positive integer in paise (₹1 = 100 paise)")
      return
    }
    if (note.trim().length < 20) {
      toast.error("Note must be at least 20 characters (audit log requirement)")
      return
    }
    setBusy(true)
    try {
      const r = await fetch(`/admin/wallets/${picked.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          direction,
          amount_inr: Math.round(amt),
          reason_code: reason,
          bucket,
          note,
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.message ?? `${r.status}`)
      }
      toast.success(`Wallet ${direction}ed by ${amt} paise`)
      setAmount("")
      setNote("")
      await loadSummary(picked)
    } catch (err) {
      toast.error((err as Error).message ?? "Adjust failed")
    } finally {
      setBusy(false)
    }
  }

  const toggleFreeze = async () => {
    if (!picked || !summary) return
    setBusy(true)
    try {
      const r = await fetch(`/admin/wallets/${picked.id}/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: summary.is_frozen ? "unfreeze" : "freeze",
          note: note || "Ops console",
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.message ?? `${r.status}`)
      }
      toast.success(summary.is_frozen ? "Unfrozen" : "Frozen")
      await loadSummary(picked)
    } catch (err) {
      toast.error((err as Error).message ?? "Action failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search by email (partial OK)"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
        />
        <Button onClick={() => void search()} disabled={busy}>
          Search
        </Button>
        {picked && (
          <Button variant="secondary" onClick={() => { setPicked(null); setSummary(null) }}>
            Clear
          </Button>
        )}
      </div>
      {results.length > 0 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Email</Table.HeaderCell>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Company</Table.HeaderCell>
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
                <Table.Cell>{c.company_id ?? "—"}</Table.Cell>
                <Table.Cell>
                  <Button size="small" onClick={() => pick(c)}>
                    Open wallet
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {picked && summary && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Email" value={picked.email} />
            <Stat
              label="Main balance"
              value={`₹${(summary.balance_inr / 100).toFixed(2)}`}
            />
            <Stat
              label="Promo balance"
              value={`₹${(summary.promo_balance_inr / 100).toFixed(2)}`}
            />
            <Stat
              label="Status"
              value={
                <Badge color={summary.is_frozen ? "red" : "green"}>
                  {summary.is_frozen ? "frozen" : "active"}
                </Badge>
              }
            />
          </div>

          <div className="rounded-md border border-ui-border-base p-4">
            <Heading level="h3">Adjust</Heading>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Direction">
                <Select
                  value={direction}
                  onValueChange={(v) => setDirection(v as "credit" | "debit")}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="credit">Credit (add)</Select.Item>
                    <Select.Item value="debit">Debit (subtract)</Select.Item>
                  </Select.Content>
                </Select>
              </Field>
              <Field label="Amount (in paise — ₹1 = 100 paise)">
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.currentTarget.value)}
                  placeholder="e.g. 50000 for ₹500"
                />
              </Field>
              <Field label="Reason code">
                <Select
                  value={reason}
                  onValueChange={(v) => setReason(v as typeof reason)}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="promo">Promotion / campaign</Select.Item>
                    <Select.Item value="goodwill">Goodwill (CS comp)</Select.Item>
                    <Select.Item value="reconciliation">Reconciliation</Select.Item>
                    <Select.Item value="correction">Correction</Select.Item>
                    <Select.Item value="other">Other</Select.Item>
                  </Select.Content>
                </Select>
              </Field>
              <Field label="Bucket">
                <Select
                  value={bucket}
                  onValueChange={(v) => setBucket(v as "main" | "promo")}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="main">Main (withdrawable)</Select.Item>
                    <Select.Item value="promo">Promo (checkout-only)</Select.Item>
                  </Select.Content>
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Note (min 20 chars — written into audit log)">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.currentTarget.value)}
                    placeholder="Ticket #1234 — promo credit adjustment"
                  />
                </Field>
              </div>
              <div className="flex gap-2 md:col-span-2">
                <Button onClick={adjust} disabled={busy}>
                  Apply {direction}
                </Button>
                <Button
                  variant={summary.is_frozen ? "primary" : "danger"}
                  onClick={toggleFreeze}
                  disabled={busy}
                >
                  {summary.is_frozen ? "Unfreeze" : "Freeze"} wallet
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-ui-border-base p-4">
            <Heading level="h3">Recent transactions</Heading>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>When</Table.HeaderCell>
                  <Table.HeaderCell>Direction</Table.HeaderCell>
                  <Table.HeaderCell>Bucket</Table.HeaderCell>
                  <Table.HeaderCell>Amount (paise)</Table.HeaderCell>
                  <Table.HeaderCell>Balance after</Table.HeaderCell>
                  <Table.HeaderCell>Kind</Table.HeaderCell>
                  <Table.HeaderCell>Note</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {(summary.transactions ?? []).slice(0, 20).map((t) => (
                  <Table.Row key={t.id}>
                    <Table.Cell>
                      {new Date(t.created_at).toLocaleString()}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={t.direction === "credit" ? "green" : "red"}>
                        {t.direction}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>{t.bucket}</Table.Cell>
                    <Table.Cell>{t.amount_inr}</Table.Cell>
                    <Table.Cell>{t.balance_after}</Table.Cell>
                    <Table.Cell>{t.kind}</Table.Cell>
                    <Table.Cell>{t.note}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}

/* ───────────────── Deposit proofs ───────────────── */

type DepositProof = {
  id: string
  customer_id: string
  claimed_amount_inr: number
  credited_amount_inr: number | null
  utr: string | null
  customer_note: string | null
  proof_file_url: string
  status: "pending" | "approved" | "rejected"
  reviewer_notes: string | null
  reviewed_at: string | null
  created_at: string
}

function DepositProofsTab() {
  const [rows, setRows] = useState<DepositProof[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending")
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(
        `/admin/deposit-proofs?status=${status}&limit=100`,
        { credentials: "include" },
      ).then((x) => x.json())
      setRows(r.deposit_proofs ?? [])
    } catch {
      toast.error("Could not load deposit proofs")
    } finally {
      setLoading(false)
    }
  }, [status])
  useEffect(() => {
    void load()
  }, [load])

  const decide = async (
    id: string,
    action: "approve" | "reject",
    extra: { credited_amount_inr?: number; reviewer_notes?: string } = {},
  ) => {
    setDecidingId(id)
    try {
      const res = await fetch(`/admin/deposit-proofs/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, ...extra }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message ?? `${res.status}`)
      }
      toast.success(`Deposit ${action}d`)
      await load()
    } catch (err) {
      toast.error((err as Error).message ?? "Action failed")
    } finally {
      setDecidingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Field label="Status">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as typeof status)}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="pending">Pending</Select.Item>
              <Select.Item value="approved">Approved</Select.Item>
              <Select.Item value="rejected">Rejected</Select.Item>
              <Select.Item value="all">All</Select.Item>
            </Select.Content>
          </Select>
        </Field>
        <Button variant="secondary" size="small" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {loading ? (
        <Text>Loading…</Text>
      ) : rows.length === 0 ? (
        <Text className="text-ui-fg-subtle">
          No {status === "all" ? "" : status} deposit proofs.
        </Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>When</Table.HeaderCell>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Claimed</Table.HeaderCell>
              <Table.HeaderCell>UTR</Table.HeaderCell>
              <Table.HeaderCell>Note</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell></Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>{new Date(r.created_at).toLocaleString()}</Table.Cell>
                <Table.Cell>
                  <code className="text-xs">{r.customer_id}</code>
                </Table.Cell>
                <Table.Cell>
                  ₹{(r.claimed_amount_inr / 100).toFixed(2)}
                  {r.credited_amount_inr != null &&
                    r.credited_amount_inr !== r.claimed_amount_inr && (
                      <div className="text-xs text-ui-fg-subtle">
                        credited ₹{(r.credited_amount_inr / 100).toFixed(2)}
                      </div>
                    )}
                </Table.Cell>
                <Table.Cell>
                  {r.utr ? <code className="text-xs">{r.utr}</code> : "—"}
                </Table.Cell>
                <Table.Cell>
                  <Text className="text-xs max-w-xs truncate">
                    {r.customer_note ?? "—"}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={depositStatusColor(r.status)}>{r.status}</Badge>
                  {r.reviewer_notes && (
                    <div className="text-xs text-ui-fg-subtle mt-1 max-w-xs truncate">
                      {r.reviewer_notes}
                    </div>
                  )}
                </Table.Cell>
                <Table.Cell>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="small"
                        variant="primary"
                        onClick={() => {
                          const credited = window.prompt(
                            `Credit how much (paise)? Enter to match claimed (${r.claimed_amount_inr}).`,
                            String(r.claimed_amount_inr),
                          )
                          if (credited === null) return
                          const amt = Number(credited)
                          if (!Number.isFinite(amt) || amt <= 0) {
                            toast.error("Enter a positive amount in paise")
                            return
                          }
                          void decide(r.id, "approve", { credited_amount_inr: Math.round(amt) })
                        }}
                        disabled={decidingId === r.id}
                      >
                        Approve & credit
                      </Button>
                      <Button
                        size="small"
                        variant="danger"
                        onClick={() => {
                          const note = window.prompt("Reason for rejection?")
                          if (!note?.trim()) return
                          void decide(r.id, "reject", { reviewer_notes: note.trim() })
                        }}
                        disabled={decidingId === r.id}
                      >
                        Reject
                      </Button>
                      {r.proof_file_url && (
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => window.open(r.proof_file_url, "_blank")}
                        >
                          View proof
                        </Button>
                      )}
                    </div>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </div>
  )
}

function depositStatusColor(s: string): "green" | "orange" | "red" | "grey" {
  if (s === "approved") return "green"
  if (s === "pending") return "orange"
  if (s === "rejected") return "red"
  return "grey"
}

/* ───────────────── Webhook events ───────────────── */

type WebhookRow = {
  id: string
  channel: string
  event_id: string | null
  event_type: string | null
  processing_status: string | null
  processing_error: string | null
  processed_at: string | null
  created_at: string
}

function WebhookEventsTab() {
  const [rows, setRows] = useState<WebhookRow[]>([])
  const [loading, setLoading] = useState(false)
  const [channel, setChannel] = useState<string>("any")
  const [status, setStatus] = useState<string>("any")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ limit: "100" })
      if (channel && channel !== "any") qs.set("channel", channel)
      if (status && status !== "any") qs.set("status", status)
      const r = await fetch(`/admin/webhook-events?${qs}`, {
        credentials: "include",
      }).then((x) => x.json())
      setRows(r.events ?? [])
    } catch {
      toast.error("Could not load webhook events")
    } finally {
      setLoading(false)
    }
  }, [channel, status])
  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Field label="Channel">
          <Select value={channel} onValueChange={setChannel}>
            <Select.Trigger>
              <Select.Value placeholder="Any" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="any">Any</Select.Item>
              <Select.Item value="razorpay">Razorpay</Select.Item>
              <Select.Item value="cashfree">Cashfree</Select.Item>
            </Select.Content>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onValueChange={setStatus}>
            <Select.Trigger>
              <Select.Value placeholder="Any" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="any">Any</Select.Item>
              <Select.Item value="processed">Processed</Select.Item>
              <Select.Item value="failed">Failed</Select.Item>
              <Select.Item value="pending">Pending</Select.Item>
            </Select.Content>
          </Select>
        </Field>
        <Button variant="secondary" size="small" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {loading ? (
        <Text>Loading…</Text>
      ) : rows.length === 0 ? (
        <Text className="text-ui-fg-subtle">No webhook events match.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>When</Table.HeaderCell>
              <Table.HeaderCell>Channel</Table.HeaderCell>
              <Table.HeaderCell>Event id</Table.HeaderCell>
              <Table.HeaderCell>Event type</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Processed</Table.HeaderCell>
              <Table.HeaderCell>Error</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>{new Date(r.created_at).toLocaleString()}</Table.Cell>
                <Table.Cell>
                  <Badge>{r.channel}</Badge>
                </Table.Cell>
                <Table.Cell>
                  <code className="text-xs">{r.event_id ?? "—"}</code>
                </Table.Cell>
                <Table.Cell>{r.event_type ?? "—"}</Table.Cell>
                <Table.Cell>
                  <Badge color={webhookStatusColor(r.processing_status)}>
                    {r.processing_status ?? "—"}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {r.processed_at
                    ? new Date(r.processed_at).toLocaleString()
                    : "—"}
                </Table.Cell>
                <Table.Cell>
                  <Text className="text-xs text-ui-fg-subtle truncate max-w-xs">
                    {r.processing_error ?? "—"}
                  </Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </div>
  )
}

function webhookStatusColor(s: string | null): "green" | "orange" | "red" | "grey" {
  if (s === "processed") return "green"
  if (s === "pending") return "orange"
  if (s === "failed") return "red"
  return "grey"
}

/* ───────────────── helpers ───────────────── */

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      size="small"
      variant={active ? "primary" : "transparent"}
      onClick={onClick}
    >
      {children}
    </Button>
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

function Stat({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-ui-border-base p-3">
      <Text className="text-ui-fg-subtle">{label}</Text>
      <div className="text-lg font-medium">{value}</div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Wallet",
  icon: CurrencyDollar,
})

export default WalletsPage
