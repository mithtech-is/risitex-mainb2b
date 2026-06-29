import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Users } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import React, { useCallback, useEffect, useState } from "react"

/**
 * Sales Reps admin (FR-8.01) — internal staff who get attributed to
 * MBO accounts and earn commission on every order placed by those
 * MBOs (FR-8.02 perpetual attribution).
 *
 * List view shows rep + active status. Click row → detail with
 * assignment count + add-assignment form (bind to customer OR company,
 * not both — DB CHECK enforces XOR).
 */

type Rep = {
  id: string
  employee_id: string
  name: string
  email: string
  phone: string | null
  active: boolean
}

type Assignment = {
  id: string
  sales_rep_id: string
  customer_id: string | null
  company_id: string | null
  assigned_at: string
  valid_until: string | null
  notes: string | null
}

const API = "/admin/sales-reps"

const SalesRepsPage = () => {
  const [reps, setReps] = useState<Rep[]>([])
  const [loading, setLoading] = useState(false)
  const [openId, setOpenId] = useState<string | "new" | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}?active=false`, {
        credentials: "include",
      }).then((x) => x.json())
      setReps(r.sales_reps ?? [])
    } catch {
      toast.error("Failed to load sales reps")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const open = reps.find((r) => r.id === openId) ?? null

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Sales Representatives</Heading>
          <Text className="text-ui-fg-subtle">
            Rep ↔ MBO mapping for FR-8.02 perpetual attribution
          </Text>
        </div>
        <div className="flex gap-2">
          <Button size="small" variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
          <Button size="small" onClick={() => setOpenId("new")}>
            New rep
          </Button>
        </div>
      </div>
      <div className="px-6 py-3">
        {loading && <Text>Loading…</Text>}
        {!loading && (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Employee ID</Table.HeaderCell>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Email</Table.HeaderCell>
                <Table.HeaderCell>Phone</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {reps.length === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={6}>
                    <Text className="text-ui-fg-subtle">
                      No reps yet. Click "New rep" to add one.
                    </Text>
                  </Table.Cell>
                </Table.Row>
              )}
              {reps.map((r) => (
                <Table.Row key={r.id}>
                  <Table.Cell className="font-mono">{r.employee_id}</Table.Cell>
                  <Table.Cell>{r.name}</Table.Cell>
                  <Table.Cell>{r.email}</Table.Cell>
                  <Table.Cell>{r.phone ?? "—"}</Table.Cell>
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
                      Manage
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </div>
      {openId && (
        <RepDrawer
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

function RepDrawer({
  row,
  isNew,
  onClose,
  onSaved,
}: {
  row: Rep | null
  isNew: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    employee_id: row?.employee_id ?? "",
    name: row?.name ?? "",
    email: row?.email ?? "",
    phone: row?.phone ?? "",
    active: row?.active ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignTarget, setAssignTarget] = useState<{
    customer_id?: string
    company_id?: string
    notes?: string
  }>({})

  const loadAssignments = useCallback(async () => {
    if (!row) return
    try {
      const r = await fetch(`${API}/${row.id}/assignments`, {
        credentials: "include",
      }).then((x) => x.json())
      setAssignments(r.assignments ?? [])
    } catch {
      // silent
    }
  }, [row])
  useEffect(() => {
    void loadAssignments()
  }, [loadAssignments])

  const save = async () => {
    setBusy(true)
    try {
      const url = isNew ? API : `${API}/${row!.id}`
      const method = isNew ? "POST" : "PATCH"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          phone: form.phone || undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message ?? `${res.status}`)
      }
      toast.success(isNew ? "Rep created" : "Saved")
      onSaved()
    } catch (err) {
      toast.error((err as Error).message ?? "Save failed")
    } finally {
      setBusy(false)
    }
  }

  const addAssignment = async () => {
    if (!row) return
    if (!assignTarget.customer_id && !assignTarget.company_id) {
      toast.error("Pick either a customer id or a company id")
      return
    }
    if (assignTarget.customer_id && assignTarget.company_id) {
      toast.error("Use customer OR company, not both")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`${API}/${row.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(assignTarget),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message ?? `${res.status}`)
      }
      toast.success("Assignment created")
      setAssignTarget({})
      await loadAssignments()
    } catch (err) {
      toast.error((err as Error).message ?? "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white p-6 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <Heading level="h2">{isNew ? "New sales rep" : row?.name}</Heading>
        <div className="mt-4 space-y-3">
          <Field label="Employee ID (HR / payroll join key)">
            <Input
              value={form.employee_id}
              onChange={(e) =>
                setForm({ ...form, employee_id: e.currentTarget.value })
              }
              disabled={!isNew}
            />
          </Field>
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.currentTarget.value })
              }
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm({ ...form, email: e.currentTarget.value })
              }
            />
          </Field>
          <Field label="Phone (optional)">
            <Input
              value={form.phone}
              onChange={(e) =>
                setForm({ ...form, phone: e.currentTarget.value })
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
              Close
            </Button>
          </div>
        </div>

        {!isNew && row && (
          <>
            <hr className="my-6" />
            <Heading level="h3">Assignments ({assignments.length})</Heading>
            <Text className="text-ui-fg-subtle">
              Each row binds this rep to ONE customer or ONE company.
              Resolution at order time: explicit `placed_by_rep_id` &gt;
              customer-scoped &gt; company-scoped.
            </Text>
            <div className="mt-3 space-y-2">
              {assignments.length === 0 && (
                <Text>No active assignments.</Text>
              )}
              {assignments.map((a) => (
                <div
                  key={a.id}
                  className="rounded border border-ui-border-base p-3"
                >
                  <Text>
                    {a.customer_id ? "Customer" : "Company"}{" "}
                    <span className="font-mono">
                      {a.customer_id ?? a.company_id}
                    </span>{" "}
                    · since {new Date(a.assigned_at).toLocaleDateString()}
                  </Text>
                  {a.notes && (
                    <Text className="text-ui-fg-subtle">{a.notes}</Text>
                  )}
                </div>
              ))}
            </div>

            <Heading level="h3" className="mt-4">
              Add assignment
            </Heading>
            <div className="space-y-3">
              <Field label="Customer ID (paste from /app/customers — leave blank if assigning to company)">
                <Input
                  value={assignTarget.customer_id ?? ""}
                  onChange={(e) =>
                    setAssignTarget({
                      ...assignTarget,
                      customer_id: e.currentTarget.value || undefined,
                    })
                  }
                  placeholder="cus_…"
                />
              </Field>
              <Field label="Company ID (paste from /app/companies — leave blank if assigning to customer)">
                <Input
                  value={assignTarget.company_id ?? ""}
                  onChange={(e) =>
                    setAssignTarget({
                      ...assignTarget,
                      company_id: e.currentTarget.value || undefined,
                    })
                  }
                  placeholder="co_…"
                />
              </Field>
              <Field label="Notes (optional)">
                <Input
                  value={assignTarget.notes ?? ""}
                  onChange={(e) =>
                    setAssignTarget({
                      ...assignTarget,
                      notes: e.currentTarget.value || undefined,
                    })
                  }
                />
              </Field>
              <Button onClick={addAssignment} disabled={busy}>
                Add assignment
              </Button>
            </div>
          </>
        )}
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
  label: "Sales Reps",
  icon: Users,
})

export default SalesRepsPage
