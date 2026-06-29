import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Swatch } from "@medusajs/icons"
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
 * Customer Tiers admin — the volume-band that drives FR-1.03 + 4.01
 * pricing. Three tiers ship seeded (local_mbo / high_footfall_mbo /
 * regional_distributor). This page is for ops to tune percentages
 * and add bespoke tiers without a code deploy.
 */

type Tier = {
  id: string
  code: string
  name: string
  priority: number
  default_payment_terms: "advance_100" | "net_30" | "net_60"
  default_commission_percent: number
  active: boolean
}

const API = "/admin/customer-tiers"

const TiersPage = () => {
  const [rows, setRows] = useState<Tier[]>([])
  const [loading, setLoading] = useState(false)
  const [openId, setOpenId] = useState<string | "new" | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(API, { credentials: "include" }).then((r) => r.json())
      setRows(res.customer_tiers ?? [])
    } catch {
      toast.error("Failed to load tiers")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const open = rows.find((r) => r.id === openId) ?? null

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Customer Tiers</Heading>
          <Text className="text-ui-fg-subtle">
            Volume bands · commission % · default payment terms (FR-1.03)
          </Text>
        </div>
        <div className="flex gap-2">
          <Button size="small" variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
          <Button size="small" onClick={() => setOpenId("new")}>
            New tier
          </Button>
        </div>
      </div>
      <div className="px-6 py-3">
        {loading && <Text>Loading…</Text>}
        {!loading && (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Code</Table.HeaderCell>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Priority</Table.HeaderCell>
                <Table.HeaderCell>Payment terms</Table.HeaderCell>
                <Table.HeaderCell>Commission %</Table.HeaderCell>
                <Table.HeaderCell>Active</Table.HeaderCell>
                <Table.HeaderCell></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((r) => (
                <Table.Row key={r.id}>
                  <Table.Cell className="font-mono">{r.code}</Table.Cell>
                  <Table.Cell>{r.name}</Table.Cell>
                  <Table.Cell>{r.priority}</Table.Cell>
                  <Table.Cell>{r.default_payment_terms}</Table.Cell>
                  <Table.Cell>{r.default_commission_percent}%</Table.Cell>
                  <Table.Cell>
                    <Badge color={r.active ? "green" : "grey"}>
                      {r.active ? "active" : "inactive"}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setOpenId(r.id)}
                    >
                      Edit
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </div>
      {openId && (
        <TierDrawer
          row={open}
          isNew={openId === "new"}
          onClose={() => setOpenId(null)}
          onSaved={() => {
            setOpenId(null)
            void load()
          }}
        />
      )}
    </Container>
  )
}

function TierDrawer({
  row,
  isNew,
  onClose,
  onSaved,
}: {
  row: Tier | null
  isNew: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    code: row?.code ?? "",
    name: row?.name ?? "",
    priority: row?.priority ?? 0,
    default_payment_terms: row?.default_payment_terms ?? "advance_100",
    default_commission_percent: row?.default_commission_percent ?? 0,
    active: row?.active ?? true,
  })
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const body = JSON.stringify({
        ...form,
        priority: Number(form.priority),
        default_commission_percent: Number(form.default_commission_percent),
      })
      const url = isNew ? API : `${API}/${row!.id}`
      const method = isNew ? "POST" : "PATCH"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message ?? `${res.status}`)
      }
      toast.success(isNew ? "Tier created" : "Tier updated")
      onSaved()
    } catch (err) {
      toast.error((err as Error).message ?? "Save failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <Heading level="h2">{isNew ? "New tier" : `Edit ${row?.name}`}</Heading>
        <div className="mt-4 space-y-3">
          <Field label="Code (lower-snake, used by integrations)">
            <Input
              value={form.code}
              onChange={(e) =>
                setForm({ ...form, code: e.currentTarget.value })
              }
              disabled={!isNew}
              placeholder="e.g. premium_distributor"
            />
          </Field>
          <Field label="Name (shown to ops)">
            <Input
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.currentTarget.value })
              }
            />
          </Field>
          <Field label="Priority (higher = surfaced first)">
            <Input
              type="number"
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: Number(e.currentTarget.value) })
              }
            />
          </Field>
          <Field label="Default payment terms">
            <Select
              value={form.default_payment_terms}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  default_payment_terms:
                    v as Tier["default_payment_terms"],
                })
              }
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="advance_100">100% advance</Select.Item>
                <Select.Item value="net_30">Net 30</Select.Item>
                <Select.Item value="net_60">Net 60</Select.Item>
              </Select.Content>
            </Select>
          </Field>
          <Field label="Default commission %">
            <Input
              type="number"
              step="0.1"
              value={form.default_commission_percent}
              onChange={(e) =>
                setForm({
                  ...form,
                  default_commission_percent: Number(
                    e.currentTarget.value,
                  ),
                })
              }
            />
          </Field>
          <Field label="Active">
            <Switch
              checked={form.active}
              onCheckedChange={(v) => setForm({ ...form, active: !!v })}
            />
          </Field>
          <div className="flex gap-2 pt-3">
            <Button onClick={save} disabled={busy}>
              {isNew ? "Create" : "Save"}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
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
  label: "Customer Tiers",
  icon: Swatch,
})

export default TiersPage
