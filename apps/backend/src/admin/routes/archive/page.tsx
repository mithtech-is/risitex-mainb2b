import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArchiveBox } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import React, { useCallback, useEffect, useState } from "react"

/**
 * RISITEX Archive — "the old details".
 *
 * Every deleted company / customer / product (and any hard-deleted row caught
 * by the DB trigger) lands in `deletion_archive` with a full JSON snapshot.
 * This page lists them and lets an operator inspect or download the snapshot,
 * so nothing is ever truly lost after a delete.
 *
 * Reads GET /admin/deletion-archive.
 */

type ArchiveRow = {
  id: string
  entity_type: string
  entity_id: string
  label: string | null
  snapshot: Record<string, unknown>
  deleted_by: string | null
  reason: string | null
  source: string
  created_at: string
}

const API = "/admin"

const TYPE_TONE: Record<string, "green" | "orange" | "blue" | "grey" | "red"> = {
  company: "blue",
  customer: "green",
  product: "orange",
}

const ArchivePage = () => {
  const [rows, setRows] = useState<ArchiveRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [type, setType] = useState<string>("all")
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "200" })
      if (type !== "all") params.set("entity_type", type)
      if (search.trim()) params.set("q", search.trim())
      const res = await fetch(`${API}/deletion-archive?${params.toString()}`, {
        credentials: "include",
      }).then((r) => r.json())
      setRows(res.archives ?? [])
    } catch {
      toast.error("Failed to load archive")
    } finally {
      setLoading(false)
    }
  }, [type, search])

  useEffect(() => {
    void load()
  }, [load])

  const open = rows.find((r) => r.id === openId) ?? null

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Heading level="h1">Archive</Heading>
          <Text className="text-ui-fg-subtle">
            Old details of deleted companies, customers &amp; products
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-2 px-6 py-3">
        {["all", "company", "customer", "product"].map((t) => (
          <Button
            key={t}
            variant={type === t ? "primary" : "transparent"}
            size="small"
            onClick={() => setType(t)}
          >
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
        <div className="ml-auto w-64">
          <Input
            placeholder="Search label / id"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </div>
      </div>

      <div className="px-6 py-3">
        {loading && <Text>Loading…</Text>}
        {!loading && rows.length === 0 && (
          <Text>Nothing archived yet. Deleted records will appear here.</Text>
        )}
        {!loading && rows.length > 0 && (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Deleted</Table.HeaderCell>
                <Table.HeaderCell>Type</Table.HeaderCell>
                <Table.HeaderCell>Label</Table.HeaderCell>
                <Table.HeaderCell>Entity id</Table.HeaderCell>
                <Table.HeaderCell>Reason</Table.HeaderCell>
                <Table.HeaderCell></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((r) => (
                <Table.Row key={r.id}>
                  <Table.Cell>
                    {new Date(r.created_at).toLocaleString()}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color={TYPE_TONE[r.entity_type] ?? "grey"}>
                      {r.entity_type}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>{r.label ?? "—"}</Table.Cell>
                  <Table.Cell className="font-mono text-xs">
                    {r.entity_id}
                  </Table.Cell>
                  <Table.Cell>{r.reason ?? "—"}</Table.Cell>
                  <Table.Cell>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setOpenId(r.id)}
                    >
                      View
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </div>

      {open && <SnapshotDrawer row={open} onClose={() => setOpenId(null)} />}
    </Container>
  )
}

function SnapshotDrawer({
  row,
  onClose,
}: {
  row: ArchiveRow
  onClose: () => void
}) {
  const json = JSON.stringify(row.snapshot, null, 2)

  const download = () => {
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${row.entity_type}-${row.entity_id}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      toast.success("Snapshot copied")
    } catch {
      toast.error("Copy failed")
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white p-6 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Heading level="h2">{row.label ?? row.entity_id}</Heading>
            <Badge color={TYPE_TONE[row.entity_type] ?? "grey"}>
              {row.entity_type}
            </Badge>
          </div>
          <Text className="text-ui-fg-subtle text-xs">
            Deleted {new Date(row.created_at).toLocaleString()}
            {row.deleted_by ? ` · by ${row.deleted_by}` : ""}
            {row.source ? ` · via ${row.source}` : ""}
          </Text>

          <div className="flex gap-2">
            <Button size="small" onClick={download}>
              Download JSON
            </Button>
            <Button size="small" variant="secondary" onClick={copy}>
              Copy
            </Button>
            <Button size="small" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>

          <pre className="max-h-[70vh] overflow-auto rounded-md bg-ui-bg-subtle p-3 text-xs">
            {json}
          </pre>
        </div>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Archive",
  icon: ArchiveBox,
})

export default ArchivePage
