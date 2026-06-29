import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Buildings } from "@medusajs/icons"
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
import React, { useCallback, useEffect, useMemo, useState } from "react"

/**
 * RISITEX Companies admin — B2B onboarding queue + directory.
 *
 * Tab 1 (default): applications awaiting review. Click → drawer
 *   with the full payload + Approve/Reject buttons. Approve mints
 *   a Medusa customer, the company row, and stamps the cross-module
 *   links (company_id / customer_tier_id / sales_rep_id /
 *   payment_terms) onto customer.
 *
 * Tab 2: approved/suspended companies. Click → drawer to suspend/
 *   unsuspend with a required note.
 *
 * Hits the existing /admin/companies and /admin/companies/applications/
 *   :id/approve|reject endpoints (Phase 4). Customer tier list comes
 *   from /admin/customer-tiers.
 */

type CompanyStatus = "pending" | "approved" | "rejected" | "suspended"

type Company = {
  id: string
  gstin: string
  trade_name: string
  status: CompanyStatus
  customer_tier_id: string | null
  sales_rep_id: string | null
  review_notes: string | null
  created_at: string
  deleted_at?: string | null
}

type CompanyApplication = {
  id: string
  gstin: string
  trade_name: string
  applicant_email: string
  applicant_phone: string | null
  status: "pending" | "approved" | "rejected"
  payload: Record<string, unknown>
  resulting_company_id: string | null
  created_at: string
  company_deleted?: boolean
}

type CustomerTier = {
  id: string
  code: string
  name: string
}

const API = "/admin"

const CompaniesPage = () => {
  const [tab, setTab] = useState<"applications" | "companies">("applications")
  const [apps, setApps] = useState<CompanyApplication[]>([])
  const [cos, setCos] = useState<Company[]>([])
  const [tiers, setTiers] = useState<CustomerTier[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [appRes, coRes, tierRes] = await Promise.all([
        fetch(`${API}/companies?view=applications&limit=200`, {
          credentials: "include",
        }).then((r) => r.json()),
        fetch(`${API}/companies?limit=200`, { credentials: "include" }).then(
          (r) => r.json(),
        ),
        fetch(`${API}/customer-tiers`, { credentials: "include" }).then((r) =>
          r.json(),
        ),
      ])
      setApps(appRes.applications ?? [])
      setCos(coRes.companies ?? [])
      setTiers(tierRes.customer_tiers ?? [])
    } catch (err) {
      toast.error("Failed to load companies")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredApps = apps.filter((a) =>
    !search
      ? true
      : [a.gstin, a.trade_name, a.applicant_email]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(search.toLowerCase())),
  )
  const filteredCos = cos.filter((c) =>
    !search
      ? true
      : [c.gstin, c.trade_name]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(search.toLowerCase())),
  )

  const openApp = apps.find((a) => a.id === openId) ?? null
  const openCo = cos.find((c) => c.id === openId) ?? null

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Heading level="h1">Companies</Heading>
          <Text className="text-ui-fg-subtle">
            B2B accounts — applications and approved companies (FR-1.02 / 1.03)
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-3 px-6 py-3">
        <Button
          variant={tab === "applications" ? "primary" : "transparent"}
          size="small"
          onClick={() => setTab("applications")}
        >
          Applications · {apps.filter((a) => a.status === "pending").length} pending
        </Button>
        <Button
          variant={tab === "companies" ? "primary" : "transparent"}
          size="small"
          onClick={() => setTab("companies")}
        >
          Companies · {cos.length}
        </Button>
        <div className="ml-auto w-64">
          <Input
            placeholder="Search GSTIN / trade name / email"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </div>
      </div>

      <div className="px-6 py-3">
        {loading && <Text>Loading…</Text>}
        {!loading && tab === "applications" && (
          <ApplicationsTable
            rows={filteredApps}
            onOpen={(id) => setOpenId(id)}
          />
        )}
        {!loading && tab === "companies" && (
          <CompaniesTable rows={filteredCos} onOpen={(id) => setOpenId(id)} />
        )}
      </div>

      {openApp && (
        <ApplicationDrawer
          row={openApp}
          tiers={tiers}
          onClose={() => setOpenId(null)}
          onDone={() => {
            setOpenId(null)
            void load()
          }}
        />
      )}
      {openCo && (
        <CompanyDrawer
          row={openCo}
          tiers={tiers}
          onClose={() => setOpenId(null)}
          onDone={() => {
            setOpenId(null)
            void load()
          }}
        />
      )}
    </Container>
  )
}

function ApplicationsTable({
  rows,
  onOpen,
}: {
  rows: CompanyApplication[]
  onOpen: (id: string) => void
}) {
  if (rows.length === 0) return <Text>No applications.</Text>
  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>GSTIN</Table.HeaderCell>
          <Table.HeaderCell>Trade name</Table.HeaderCell>
          <Table.HeaderCell>Applicant</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell>Submitted</Table.HeaderCell>
          <Table.HeaderCell></Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((r) => (
          <Table.Row key={r.id} className="cursor-pointer">
            <Table.Cell className="font-mono">{r.gstin}</Table.Cell>
            <Table.Cell>{r.trade_name}</Table.Cell>
            <Table.Cell>
              {r.applicant_email}
              {r.applicant_phone ? ` · ${r.applicant_phone}` : ""}
            </Table.Cell>
            <Table.Cell>
              <StatusBadge status={r.company_deleted ? "deleted" : r.status} />
            </Table.Cell>
            <Table.Cell>{new Date(r.created_at).toLocaleString()}</Table.Cell>
            <Table.Cell>
              <Button
                size="small"
                variant="secondary"
                onClick={() => onOpen(r.id)}
              >
                Review
              </Button>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
}

function CompaniesTable({
  rows,
  onOpen,
}: {
  rows: Company[]
  onOpen: (id: string) => void
}) {
  if (rows.length === 0) return <Text>No companies yet.</Text>
  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>GSTIN</Table.HeaderCell>
          <Table.HeaderCell>Trade name</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell>Created</Table.HeaderCell>
          <Table.HeaderCell></Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((r) => (
          <Table.Row key={r.id}>
            <Table.Cell className="font-mono">{r.gstin}</Table.Cell>
            <Table.Cell>{r.trade_name}</Table.Cell>
            <Table.Cell>
              <StatusBadge status={r.deleted_at ? "deleted" : r.status} />
            </Table.Cell>
            <Table.Cell>{new Date(r.created_at).toLocaleString()}</Table.Cell>
            <Table.Cell>
              <Button
                size="small"
                variant="secondary"
                onClick={() => onOpen(r.id)}
              >
                {r.deleted_at ? "View" : "Manage"}
              </Button>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, "green" | "orange" | "red" | "grey"> = {
    approved: "green",
    pending: "orange",
    rejected: "red",
    suspended: "red",
    deleted: "grey",
  }
  return <Badge color={tone[status] ?? "grey"}>{status}</Badge>
}

function ApplicationDrawer({
  row,
  tiers,
  onClose,
  onDone,
}: {
  row: CompanyApplication
  tiers: CustomerTier[]
  onClose: () => void
  onDone: () => void
}) {
  const [tierId, setTierId] = useState(tiers[0]?.id ?? "")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const activeTiers = useMemo(() => tiers.filter((t) => t.id), [tiers])

  useEffect(() => {
    if (!tierId && activeTiers[0]?.id) {
      setTierId(activeTiers[0].id)
    }
  }, [activeTiers, tierId])

  const approve = async () => {
    if (!tierId) {
      toast.error("Pick a tier first")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(
        `${API}/companies/applications/${row.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            customer_tier_id: tierId,
            review_notes: notes || undefined,
          }),
        },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message ?? `${res.status}`)
      }
      toast.success("Approved")
      onDone()
    } catch (err) {
      toast.error(
        (err as Error).message ?? "Could not approve — try again or reload",
      )
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (notes.trim().length < 3) {
      toast.error("Provide a rejection reason (min 3 chars)")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(
        `${API}/companies/applications/${row.id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ review_notes: notes }),
        },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message ?? `${res.status}`)
      }
      toast.success("Rejected")
      onDone()
    } catch (err) {
      toast.error((err as Error).message ?? "Could not reject")
    } finally {
      setBusy(false)
    }
  }

  const payload = row.payload as {
    contact_name?: string
    billing_address?: {
      line1?: string
      line2?: string
      city?: string
      state?: string
      postal_code?: string
      country_code?: string
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <div className="space-y-4">
        <Heading level="h2">Review application</Heading>
        <Row label="GSTIN" value={<span className="font-mono">{row.gstin}</span>} />
        <Row label="Trade name" value={row.trade_name} />
        <Row
          label="Applicant"
          value={
            <>
              {row.applicant_email}
              {row.applicant_phone ? ` · ${row.applicant_phone}` : ""}
            </>
          }
        />
        {payload.contact_name && (
          <Row label="Contact name" value={payload.contact_name} />
        )}
        {payload.billing_address && (
          <Row
            label="Billing address"
            value={
              <>
                {payload.billing_address.line1}
                {payload.billing_address.line2
                  ? `, ${payload.billing_address.line2}`
                  : ""}
                <br />
                {payload.billing_address.city}, {payload.billing_address.state}{" "}
                {payload.billing_address.postal_code} ·{" "}
                {payload.billing_address.country_code?.toUpperCase()}
              </>
            }
          />
        )}
        <hr className="my-3" />
        {row.status === "pending" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tier">Assign customer tier *</Label>
              <select
                id="tier"
                value={tierId}
                onChange={(e) => setTierId(e.currentTarget.value)}
                disabled={busy || activeTiers.length === 0}
                className="h-10 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-ui-fg-base outline-none transition-fg placeholder:text-ui-fg-muted hover:bg-ui-bg-field-hover focus:border-ui-border-interactive focus:shadow-borders-focus disabled:cursor-not-allowed disabled:bg-ui-bg-disabled disabled:text-ui-fg-disabled"
              >
                <option value="" disabled>
                  {activeTiers.length ? "Pick a tier" : "No tiers available"}
                </option>
                {activeTiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes (optional for approve, required for reject)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
                placeholder="Reason / context for the audit log"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={approve} disabled={busy}>
                Approve
              </Button>
              <Button variant="danger" onClick={reject} disabled={busy}>
                Reject
              </Button>
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <Row label="Final status" value={<StatusBadge status={row.status} />} />
            {row.resulting_company_id && (
              <Row label="Company id" value={row.resulting_company_id} />
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </>
        )}
      </div>
    </DrawerBackdrop>
  )
}

function CompanyDrawer({
  row,
  tiers,
  onClose,
  onDone,
}: {
  row: Company
  tiers: CustomerTier[]
  onClose: () => void
  onDone: () => void
}) {
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const tier = tiers.find((t) => t.id === row.customer_tier_id) ?? null

  const action = async (suffix: "suspend" | "unsuspend") => {
    if (suffix === "suspend" && notes.trim().length < 3) {
      toast.error("Reason required to suspend (min 3 chars)")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`${API}/companies/${row.id}/${suffix}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body:
          suffix === "suspend"
            ? JSON.stringify({ review_notes: notes })
            : "{}",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message ?? `${res.status}`)
      }
      toast.success(suffix === "suspend" ? "Suspended" : "Unsuspended")
      onDone()
    } catch (err) {
      toast.error((err as Error).message ?? "Failed")
    } finally {
      setBusy(false)
    }
  }

  // Hard remove the company (any status). Detaches linked buyers and frees the
  // GSTIN for a fresh application. Irreversible from the UI — gate behind a confirm.
  const del = async () => {
    if (
      !window.confirm(
        `Delete "${row.trade_name}"?\n\n` +
          `• The B2B company is removed and its GSTIN freed for re-application.\n` +
          `• Any customers under it revert to regular accounts (login kept, tier pricing dropped).\n\n` +
          `This can't be undone from here.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`${API}/companies/${row.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message ?? `${res.status}`)
      }
      toast.success("Company deleted")
      onDone()
    } catch (err) {
      toast.error((err as Error).message ?? "Could not delete")
    } finally {
      setBusy(false)
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <div className="space-y-4">
        <Heading level="h2">{row.trade_name}</Heading>
        <Row label="GSTIN" value={<span className="font-mono">{row.gstin}</span>} />
        <Row
          label="Status"
          value={<StatusBadge status={row.deleted_at ? "deleted" : row.status} />}
        />
        <Row label="Tier" value={tier ? `${tier.name} (${tier.code})` : "—"} />
        {row.review_notes && (
          <Row label="Last notes" value={row.review_notes} />
        )}

        <hr className="my-3" />
        {row.deleted_at ? (
          // Already deleted: no actions; point ops at the Archive for details.
          <>
            <Text className="text-ui-fg-subtle text-sm">
              This company was deleted on{" "}
              {new Date(row.deleted_at).toLocaleString()}. Its customers and
              their logins were removed from the storefront. The full record is
              kept in the <strong>Archive</strong> section.
            </Text>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </>
        ) : (
          <>
            {row.status === "approved" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="susp-notes">Reason for suspension *</Label>
                <Input
                  id="susp-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.currentTarget.value)}
                  placeholder="3+ chars; written into the audit log"
                />
              </div>
            )}

            {/* Action row — Delete is available for every live status.
                Suspend/Unsuspend show only where they apply. */}
            <div className="flex flex-wrap gap-2">
              {row.status === "approved" && (
                <Button
                  variant="danger"
                  onClick={() => action("suspend")}
                  disabled={busy}
                >
                  Suspend
                </Button>
              )}
              {row.status === "suspended" && (
                <Button onClick={() => action("unsuspend")} disabled={busy}>
                  Unsuspend
                </Button>
              )}
              <Button variant="danger" onClick={del} disabled={busy}>
                Delete company
              </Button>
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Close
              </Button>
            </div>
            <Text className="text-ui-fg-subtle text-xs">
              Deleting removes the company AND its customers + their logins from
              the storefront, and frees the GSTIN for re-application. The deleted
              company stays listed here (greyed) and in the Archive.
            </Text>
          </>
        )}
      </div>
    </DrawerBackdrop>
  )
}

function DrawerBackdrop({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto bg-white p-6 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

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

export const config = defineRouteConfig({
  label: "Companies",
  icon: Buildings,
})

export default CompaniesPage
