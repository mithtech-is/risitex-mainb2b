// apps/backend/src/admin/routes/payment-verifications/page.tsx
import React, { useEffect, useState, useCallback } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CheckCircleSolid } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text, toast } from "@medusajs/ui"

type Row = {
  id: string
  po_number: string
  order_display_id: number | null
  customer_id: string
  company_id: string | null
  email: string | null
  amount_major: number
  upi_transaction_id: string | null
  payment_date: string | null
  remarks: string | null
  screenshot_url: string | null
  payment_status: string | null
  created_at: string
}

const statusColor = (s: string | null): "green" | "red" | "orange" | "grey" =>
  s === "paid" ? "green" : s === "rejected" ? "red" : s === "clarification_requested" ? "orange" : "grey"

const PaymentVerificationsPage = () => {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState("awaiting_verification")

  const load = useCallback(() => {
    fetch(`/admin/payment-verifications?status=${filter}`, { credentials: "include" })
      .then((r) => r.json())
      .then((b) => setRows(b.payment_verifications ?? []))
      .catch(() => toast.error("Couldn't load verifications"))
  }, [filter])

  useEffect(() => { load() }, [load])

  const decide = async (id: string, decision: "approve" | "reject" | "clarify") => {
    let note: string | undefined
    if (decision !== "approve") {
      note = window.prompt(decision === "reject" ? "Reason for rejection?" : "What clarification is needed?") || undefined
      if (decision === "reject" && !note) return
    }
    setBusy(id)
    try {
      const res = await fetch(`/admin/payment-verifications/${id}/decide`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success(`Payment ${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "clarification requested"}`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Container className="p-6">
      <div className="flex items-center justify-between mb-4">
        <Heading level="h1">Payment Verification</Heading>
        <select className="border rounded px-2 py-1 bg-ui-bg-field" value={filter} onChange={(e) => setFilter(e.currentTarget.value)}>
          <option value="awaiting_verification">Awaiting verification</option>
          <option value="paid">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="clarification_requested">Clarification requested</option>
          <option value="all">All</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <Text className="text-ui-fg-subtle">No Manual UPI payments in this state.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Company</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Txn ID</Table.HeaderCell>
              <Table.HeaderCell>Proof</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>{r.order_display_id ? `#${r.order_display_id}` : r.po_number}<div className="text-ui-fg-subtle text-xs">{r.email ?? r.customer_id}</div></Table.Cell>
                <Table.Cell>{r.company_id ?? "—"}</Table.Cell>
                <Table.Cell>₹{r.amount_major.toLocaleString("en-IN")}</Table.Cell>
                <Table.Cell><span className="font-mono text-xs">{r.upi_transaction_id ?? "—"}</span></Table.Cell>
                <Table.Cell>{r.screenshot_url ? <a className="underline" href={r.screenshot_url} target="_blank" rel="noreferrer">View</a> : "—"}</Table.Cell>
                <Table.Cell><Badge color={statusColor(r.payment_status)}>{r.payment_status ?? "—"}</Badge></Table.Cell>
                <Table.Cell>
                  <div className="flex gap-2">
                    <Button size="small" variant="primary" disabled={busy === r.id || r.payment_status === "paid"} onClick={() => void decide(r.id, "approve")}>Approve</Button>
                    <Button size="small" variant="danger" disabled={busy === r.id} onClick={() => void decide(r.id, "reject")}>Reject</Button>
                    <Button size="small" variant="secondary" disabled={busy === r.id} onClick={() => void decide(r.id, "clarify")}>Clarify</Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Payment Verification",
  icon: CheckCircleSolid,
})

export default PaymentVerificationsPage
