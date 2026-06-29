import React, { useEffect, useState } from "react"
import {
    Button,
    Input,
    Text,
    Heading,
    Badge,
    Select,
    Table,
    StatusBadge,
    toast,
} from "@medusajs/ui"

/**
 * Paginated log viewer for outbound email attempts. Uses the
 * /admin/email/logs endpoint which returns newest-first and supports
 * basic status + substring filtering.
 */

type LogRow = {
    id: string
    to_email: string
    template_slug: string | null
    subject: string | null
    status: "sent" | "failed" | "skipped"
    error: string | null
    provider_message_id: string | null
    meta: any
    created_at: string
}

const PAGE = 50

export default function LogsTab() {
    const [rows, setRows] = useState<LogRow[]>([])
    const [loading, setLoading] = useState(true)
    const [offset, setOffset] = useState(0)
    const [total, setTotal] = useState(0)
    const [status, setStatus] = useState<"all" | "sent" | "failed" | "skipped">("all")
    const [q, setQ] = useState("")
    const [expanded, setExpanded] = useState<string | null>(null)

    const load = async (nextOffset = offset) => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            params.set("limit", String(PAGE))
            params.set("offset", String(nextOffset))
            if (status !== "all") params.set("status", status)
            if (q.trim()) params.set("q", q.trim())
            const r = await fetch(`/admin/email/logs?${params.toString()}`, {
                credentials: "include",
            })
            const data = await r.json()
            setRows(data.logs || [])
            setTotal(data.count || 0)
            setOffset(nextOffset)
        } catch (err: any) {
            toast.error("Failed to load logs", { description: err?.message })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load(0)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status])

    const go = (direction: "prev" | "next") => {
        if (direction === "prev") {
            load(Math.max(0, offset - PAGE))
        } else {
            load(offset + PAGE)
        }
    }

    const showingStart = rows.length > 0 ? offset + 1 : 0
    const showingEnd = offset + rows.length

    return (
        <div className="flex flex-col gap-5">
            <div>
                <Heading level="h2">Email log</Heading>
                <Text className="text-ui-fg-muted" size="small">
                    Append-only record of every outbound send — succeeded, failed, or
                    skipped (SMTP disabled / no template bound).
                </Text>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <Input
                    placeholder="Search recipient or slug"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") load(0)
                    }}
                    className="max-w-xs"
                />
                <Select
                    value={status}
                    onValueChange={(v) =>
                        setStatus(v as "all" | "sent" | "failed" | "skipped")
                    }
                >
                    <Select.Trigger className="max-w-[12rem]">
                        <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                        <Select.Item value="all">All statuses</Select.Item>
                        <Select.Item value="sent">Sent</Select.Item>
                        <Select.Item value="failed">Failed</Select.Item>
                        <Select.Item value="skipped">Skipped</Select.Item>
                    </Select.Content>
                </Select>
                <Button variant="secondary" onClick={() => load(0)}>
                    Refresh
                </Button>
                <Text className="text-ui-fg-muted ml-auto" size="small">
                    {total > 0
                        ? `Showing ${showingStart}–${showingEnd} of ${total}`
                        : "No logs"}
                </Text>
            </div>

            <div className="border border-ui-border-base rounded-lg overflow-hidden">
                <Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>Time</Table.HeaderCell>
                            <Table.HeaderCell>Status</Table.HeaderCell>
                            <Table.HeaderCell>Recipient</Table.HeaderCell>
                            <Table.HeaderCell>Template</Table.HeaderCell>
                            <Table.HeaderCell>Subject</Table.HeaderCell>
                            <Table.HeaderCell className="text-right">
                                Actions
                            </Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {loading ? (
                            <Table.Row>
                                <Table.Cell colSpan={6}>Loading…</Table.Cell>
                            </Table.Row>
                        ) : rows.length === 0 ? (
                            <Table.Row>
                                <Table.Cell colSpan={6}>
                                    <Text className="text-ui-fg-muted">No matches.</Text>
                                </Table.Cell>
                            </Table.Row>
                        ) : (
                            rows.flatMap((r) => {
                                const time = new Date(r.created_at).toLocaleString()
                                const base = (
                                    <Table.Row key={r.id}>
                                        <Table.Cell>
                                            <Text size="xsmall" className="text-ui-fg-muted">
                                                {time}
                                            </Text>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <StatusBadge
                                                color={
                                                    r.status === "sent"
                                                        ? "green"
                                                        : r.status === "failed"
                                                          ? "red"
                                                          : "grey"
                                                }
                                            >
                                                {r.status}
                                            </StatusBadge>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <span className="font-mono text-xs">
                                                {r.to_email}
                                            </span>
                                        </Table.Cell>
                                        <Table.Cell>
                                            {r.template_slug ? (
                                                <Badge size="2xsmall">{r.template_slug}</Badge>
                                            ) : (
                                                <Text size="xsmall" className="text-ui-fg-muted">
                                                    —
                                                </Text>
                                            )}
                                        </Table.Cell>
                                        <Table.Cell className="max-w-xs truncate">
                                            {r.subject ?? "—"}
                                        </Table.Cell>
                                        <Table.Cell className="text-right">
                                            <Button
                                                variant="secondary"
                                                size="small"
                                                onClick={() =>
                                                    setExpanded((cur) => (cur === r.id ? null : r.id))
                                                }
                                            >
                                                {expanded === r.id ? "Hide" : "Details"}
                                            </Button>
                                        </Table.Cell>
                                    </Table.Row>
                                )
                                if (expanded !== r.id) return [base]
                                return [
                                    base,
                                    <Table.Row key={`${r.id}-detail`}>
                                        <Table.Cell colSpan={6}>
                                            <div className="bg-ui-bg-subtle rounded-lg p-3 flex flex-col gap-2">
                                                {r.error && (
                                                    <div>
                                                        <Text
                                                            size="xsmall"
                                                            className="text-ui-fg-muted uppercase tracking-wider"
                                                        >
                                                            Error
                                                        </Text>
                                                        <pre className="text-xs font-mono whitespace-pre-wrap text-ui-fg-error">
                                                            {r.error}
                                                        </pre>
                                                    </div>
                                                )}
                                                {r.provider_message_id && (
                                                    <div>
                                                        <Text
                                                            size="xsmall"
                                                            className="text-ui-fg-muted uppercase tracking-wider"
                                                        >
                                                            Message id
                                                        </Text>
                                                        <span className="text-xs font-mono">
                                                            {r.provider_message_id}
                                                        </span>
                                                    </div>
                                                )}
                                                {r.meta && (
                                                    <div>
                                                        <Text
                                                            size="xsmall"
                                                            className="text-ui-fg-muted uppercase tracking-wider"
                                                        >
                                                            Meta
                                                        </Text>
                                                        <pre className="text-xs font-mono whitespace-pre-wrap">
                                                            {JSON.stringify(r.meta, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        </Table.Cell>
                                    </Table.Row>,
                                ]
                            })
                        )}
                    </Table.Body>
                </Table>
            </div>

            <div className="flex items-center justify-end gap-2">
                <Button
                    variant="secondary"
                    onClick={() => go("prev")}
                    disabled={loading || offset === 0}
                >
                    Previous
                </Button>
                <Button
                    variant="secondary"
                    onClick={() => go("next")}
                    disabled={loading || offset + rows.length >= total}
                >
                    Next
                </Button>
            </div>
        </div>
    )
}
