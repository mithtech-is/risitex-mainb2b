import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShieldCheck } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import React, { useCallback, useEffect, useState } from "react"

/**
 * PO Approvals — ops console.
 *
 * Two tabs:
 *   - Awaiting approval: buyer recorded payment proof but admin hasn't
 *     approved yet. Approve here to unblock shipment + invoice display
 *     on the buyer side.
 *   - All purchase orders: full list for audit.
 *
 * The approval acts on PO metadata only — no Medusa order is fabricated.
 * Once approved, the buyer's /b2b/shipments + /b2b/invoices pages surface
 * the PO as a tracked shipment / issuable invoice.
 */

type Po = {
  id: string
  po_number: string
  file_url: string | null
  value_major: number
  currency_code: string
  created_at: string
  order_id: string | null
  customer: { id: string; email?: string | null; name?: string | null } | null
  payment_confirmed_at: string | null
  payment_confirmed_method: string | null
  payment_confirmed_reference: string | null
  admin_approved_at: string | null
  admin_approved_by_name: string | null
  admin_approval_notes: string | null
  dispatched_at: string | null
  dispatch_tracking_number: string | null
  dispatch_carrier: string | null
}

type Tab = "awaiting" | "all"

const PoApprovalsPage = () => {
  const [tab, setTab] = useState<Tab>("awaiting")
  const [rows, setRows] = useState<Po[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({})
  const [shipMethods, setShipMethods] = useState<
    Record<string, { tracking: string; carrier: string }>
  >({})

  const load = useCallback(async () => {
    setError(null)
    setRows(null)
    const qs =
      tab === "awaiting" ? "?awaiting_approval=true" : "?limit=200"
    try {
      const res = await fetch(`/admin/purchase-orders${qs}`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { purchase_orders: Po[] }
      setRows(body.purchase_orders ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load purchase orders")
      setRows([])
    }
  }, [tab])

  useEffect(() => {
    void load()
  }, [load])

  const approve = async (po: Po) => {
    setBusy((b) => ({ ...b, [po.id]: true }))
    try {
      const res = await fetch(
        `/admin/purchase-orders/${encodeURIComponent(po.id)}/approve-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            notes: approvalNotes[po.id]?.trim() || undefined,
          }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { message?: string })
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      toast.success(`Approved ${po.po_number}`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed")
    } finally {
      setBusy((b) => ({ ...b, [po.id]: false }))
    }
  }

  const markShipped = async (po: Po) => {
    const { tracking, carrier } = shipMethods[po.id] ?? {
      tracking: "",
      carrier: "",
    }
    if (!tracking || !carrier) {
      toast.error("Tracking number and carrier are both required.")
      return
    }
    setBusy((b) => ({ ...b, [po.id]: true }))
    try {
      const res = await fetch(
        `/admin/purchase-orders/${encodeURIComponent(po.id)}/mark-shipped`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            tracking_number: tracking.trim(),
            carrier: carrier.trim(),
          }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { message?: string })
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      toast.success(`Marked shipped: ${po.po_number}`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mark shipped failed")
    } finally {
      setBusy((b) => ({ ...b, [po.id]: false }))
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Purchase order approvals</Heading>
        <Text className="text-ui-fg-subtle">
          Approve buyer-submitted payment proofs to unblock shipment +
          invoice display on the buyer side. Once approved, you can record
          dispatch + tracking — the buyer&apos;s shipment / invoice tabs
          pick it up automatically.
        </Text>
      </div>

      <div className="flex flex-wrap gap-2 px-6 py-3">
        <Button
          variant={tab === "awaiting" ? "primary" : "secondary"}
          onClick={() => setTab("awaiting")}
        >
          Awaiting approval
        </Button>
        <Button
          variant={tab === "all" ? "primary" : "secondary"}
          onClick={() => setTab("all")}
        >
          All purchase orders
        </Button>
        <div className="ml-auto">
          <Button variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="px-6 py-4">
        {error && (
          <div className="mb-4 rounded-md border border-ui-border-error bg-ui-bg-subtle p-3">
            <Text className="text-ui-fg-error">{error}</Text>
          </div>
        )}
        {rows === null ? (
          <Text>Loading…</Text>
        ) : rows.length === 0 ? (
          <Text className="text-ui-fg-subtle">
            {tab === "awaiting"
              ? "No purchase orders are awaiting approval right now."
              : "No purchase orders found."}
          </Text>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>PO</Table.HeaderCell>
                <Table.HeaderCell>Buyer</Table.HeaderCell>
                <Table.HeaderCell>Placed</Table.HeaderCell>
                <Table.HeaderCell>Value</Table.HeaderCell>
                <Table.HeaderCell>Payment proof</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Action</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((po) => {
                const awaiting =
                  !!po.payment_confirmed_at && !po.admin_approved_at
                const approved = !!po.admin_approved_at
                const dispatched = !!po.dispatched_at
                return (
                  <Table.Row key={po.id}>
                    <Table.Cell>
                      <div className="flex flex-col">
                        <span className="font-mono text-sm">{po.po_number}</span>
                        <span className="font-mono text-xs text-ui-fg-subtle">
                          {po.id}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-col">
                        <span>{po.customer?.name ?? "—"}</span>
                        <span className="text-xs text-ui-fg-subtle">
                          {po.customer?.email ?? "—"}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      {new Date(po.created_at).toLocaleString()}
                    </Table.Cell>
                    <Table.Cell>
                      ₹{po.value_major.toLocaleString("en-IN")}
                    </Table.Cell>
                    <Table.Cell>
                      {po.payment_confirmed_at ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm">
                            {po.payment_confirmed_method ?? "—"}
                          </span>
                          <span className="font-mono text-xs text-ui-fg-subtle">
                            {po.payment_confirmed_reference ?? "—"}
                          </span>
                          <span className="text-xs text-ui-fg-subtle">
                            {new Date(po.payment_confirmed_at).toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <Badge color="orange">Pending</Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {dispatched ? (
                        <Badge color="green">Shipped</Badge>
                      ) : approved ? (
                        <Badge color="blue">Approved</Badge>
                      ) : awaiting ? (
                        <Badge color="orange">Awaiting approval</Badge>
                      ) : (
                        <Badge color="grey">Draft</Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {awaiting && (
                        <div className="flex flex-col gap-2">
                          <Input
                            placeholder="Reviewer notes (optional)"
                            value={approvalNotes[po.id] ?? ""}
                            onChange={(e) =>
                              setApprovalNotes((s) => ({
                                ...s,
                                [po.id]: e.currentTarget.value,
                              }))
                            }
                          />
                          <Button
                            size="small"
                            variant="primary"
                            disabled={!!busy[po.id]}
                            onClick={() => void approve(po)}
                          >
                            Approve payment
                          </Button>
                        </div>
                      )}
                      {approved && !dispatched && (
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs">
                            Approved by{" "}
                            <span className="font-mono">
                              {po.admin_approved_by_name ?? "admin"}
                            </span>
                          </Label>
                          <Input
                            placeholder="Carrier (e.g. Delhivery)"
                            value={shipMethods[po.id]?.carrier ?? ""}
                            onChange={(e) =>
                              setShipMethods((s) => ({
                                ...s,
                                [po.id]: {
                                  carrier: e.currentTarget.value,
                                  tracking: s[po.id]?.tracking ?? "",
                                },
                              }))
                            }
                          />
                          <Input
                            placeholder="Tracking / AWB number"
                            value={shipMethods[po.id]?.tracking ?? ""}
                            onChange={(e) =>
                              setShipMethods((s) => ({
                                ...s,
                                [po.id]: {
                                  carrier: s[po.id]?.carrier ?? "",
                                  tracking: e.currentTarget.value,
                                },
                              }))
                            }
                          />
                          <Button
                            size="small"
                            variant="secondary"
                            disabled={!!busy[po.id]}
                            onClick={() => void markShipped(po)}
                          >
                            Mark shipped
                          </Button>
                        </div>
                      )}
                      {dispatched && (
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span>
                            {po.dispatch_carrier} ·{" "}
                            <span className="font-mono">
                              {po.dispatch_tracking_number}
                            </span>
                          </span>
                          <span className="text-ui-fg-subtle">
                            Dispatched{" "}
                            {po.dispatched_at
                              ? new Date(po.dispatched_at).toLocaleString()
                              : "—"}
                          </span>
                        </div>
                      )}
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "PO approvals",
  icon: ShieldCheck,
})

export default PoApprovalsPage
