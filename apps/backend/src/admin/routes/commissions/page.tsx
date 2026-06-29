import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Heart } from "@medusajs/icons"
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
 * Commissions admin (FR-8.x). One-page list of every commission_record
 * with filters by earner / status / order. Each row can be voided
 * with a required reason (clawback after order cancellation, etc.).
 *
 * Reads /admin/commissions; voids via /admin/commissions/:id/void.
 */

type Commission = {
  id: string
  earner_type: "sales_rep"
  earner_id: string
  reference_type: "order" | "refund" | "manual"
  reference_id: string
  amount_minor: number | string
  currency_code: string
  status: "pending" | "paid" | "void"
  earned_at: string
  paid_at: string | null
  voided_at: string | null
  voided_reason: string | null
}

const API = "/admin/commissions"

const CommissionsPage = () => {
  const [rows, setRows] = useState<Commission[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<"all" | "pending" | "paid" | "void">("all")
  const [earnerType, setEarnerType] = useState<"all" | "sales_rep">("all")
  const [voidId, setVoidId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0" })
      if (status !== "all") params.set("status", status)
      if (earnerType !== "all") params.set("earner_type", earnerType)
      const r = await fetch(`${API}?${params}`, {
        credentials: "include",
      }).then((x) => x.json())
      setRows(r.commissions ?? [])
      setCount(r.count ?? 0)
    } catch {
      toast.error("Failed to load commissions")
    } finally {
      setLoading(false)
    }
  }, [status, earnerType])
  useEffect(() => {
    void load()
  }, [load])

  const submitVoid = async () => {
    if (!voidId) return
    if (voidReason.trim().length < 3) {
      toast.error("Reason required (3+ chars)")
      return
    }
    setBusy(true)
    try {
      const r = await fetch(`${API}/${voidId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: voidReason }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.message ?? `${r.status}`)
      }
      toast.success("Voided")
      setVoidId(null)
      setVoidReason("")
      await load()
    } catch (err) {
      toast.error((err as Error).message ?? "Void failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Commissions</Heading>
        <Text className="text-ui-fg-subtle">
          Sales-rep payout records (FR-8.x)
        </Text>
      </div>

      <div className="flex flex-wrap items-end gap-3 px-6 py-3">
        <div className="flex flex-col gap-1">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <Select.Trigger className="min-w-32">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">All</Select.Item>
              <Select.Item value="pending">Pending</Select.Item>
              <Select.Item value="paid">Paid</Select.Item>
              <Select.Item value="void">Void</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Earner</Label>
          <Select
            value={earnerType}
            onValueChange={(v) => setEarnerType(v as typeof earnerType)}
          >
            <Select.Trigger className="min-w-32">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">All</Select.Item>
              <Select.Item value="sales_rep">Sales rep</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <Button variant="secondary" size="small" onClick={() => void load()}>
          Refresh
        </Button>
        <Text className="ml-auto text-ui-fg-subtle">{count} total</Text>
      </div>

      <div className="px-6 py-3">
        {loading && <Text>Loading…</Text>}
        {!loading && (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>When</Table.HeaderCell>
                <Table.HeaderCell>Earner</Table.HeaderCell>
                <Table.HeaderCell>For</Table.HeaderCell>
                <Table.HeaderCell>Amount</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.length === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={6}>
                    <Text className="text-ui-fg-subtle">
                      No commissions match these filters.
                    </Text>
                  </Table.Cell>
                </Table.Row>
              )}
              {rows.map((c) => (
                <Table.Row key={c.id}>
                  <Table.Cell>
                    {new Date(c.earned_at).toLocaleString()}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color="blue">
                      {c.earner_type}
                    </Badge>
                    <div className="font-mono text-xs">{c.earner_id}</div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge>{c.reference_type}</Badge>
                    <div className="font-mono text-xs">{c.reference_id}</div>
                  </Table.Cell>
                  <Table.Cell>
                    {c.currency_code?.toUpperCase()}{" "}
                    {(Number(c.amount_minor) / 100).toFixed(2)}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      color={
                        c.status === "paid"
                          ? "green"
                          : c.status === "void"
                            ? "red"
                            : "orange"
                      }
                    >
                      {c.status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {c.status !== "void" && (
                      <Button
                        size="small"
                        variant="danger"
                        onClick={() => setVoidId(c.id)}
                      >
                        Void
                      </Button>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </div>

      {voidId && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setVoidId(null)}
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <Heading level="h2">Void commission</Heading>
            <Text className="text-ui-fg-subtle">
              Voids are permanent. Use only for clawbacks (canceled order
              after commission was already paid) or duplicate records.
            </Text>
            <div className="mt-4 space-y-3">
              <Label>Reason (written to audit log)</Label>
              <Input
                value={voidReason}
                onChange={(e) => setVoidReason(e.currentTarget.value)}
                placeholder="e.g. Order canceled after rep payout"
              />
              <div className="flex gap-2">
                <Button variant="danger" onClick={submitVoid} disabled={busy}>
                  Confirm void
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setVoidId(null)}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Commissions",
  icon: Heart,
})

export default CommissionsPage
