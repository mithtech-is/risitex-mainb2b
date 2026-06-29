import React, { useEffect, useState } from "react"
import {
    Button,
    Input,
    Label,
    Text,
    Heading,
    Switch,
    Select,
    Badge,
    Table,
    toast,
} from "@medusajs/ui"

/**
 * Event → template binding editor.
 *
 * Flat table of every bound event with inline controls. New bindings are
 * added via the form at the top; existing rows are edited in-place and
 * saved per-row so one bad save doesn't trash the rest.
 */

type Mapping = {
    id: string
    event_name: string
    template_slug: string
    to_resolver: "customer_email" | "admin_email" | "static"
    static_to: string | null
    enabled: boolean
}

type TemplateOption = { slug: string; name: string }

export default function EventsTab() {
    const [loading, setLoading] = useState(true)
    const [mappings, setMappings] = useState<Mapping[]>([])
    const [templates, setTemplates] = useState<TemplateOption[]>([])
    // Local per-row draft overrides, keyed by mapping.id, so we can edit
    // without trampling the upstream list or closing an inline form.
    const [drafts, setDrafts] = useState<Record<string, Partial<Mapping>>>({})
    const [savingId, setSavingId] = useState<string | null>(null)

    const [newEvent, setNewEvent] = useState("")
    const [newSlug, setNewSlug] = useState("")
    const [newResolver, setNewResolver] =
        useState<Mapping["to_resolver"]>("customer_email")
    const [newStatic, setNewStatic] = useState("")

    const load = async () => {
        setLoading(true)
        try {
            const [mapsRes, tplRes] = await Promise.all([
                fetch("/admin/email/events", { credentials: "include" }),
                fetch("/admin/email/templates", { credentials: "include" }),
            ])
            const { mappings } = (await mapsRes.json()) as { mappings: Mapping[] }
            const { templates } = (await tplRes.json()) as {
                templates: TemplateOption[]
            }
            setMappings(mappings || [])
            setTemplates(templates || [])
            setDrafts({})
        } catch (err: any) {
            toast.error("Failed to load events", { description: err?.message })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])

    const mergedRow = (row: Mapping): Mapping => {
        return { ...row, ...(drafts[row.id] ?? {}) } as Mapping
    }

    const setDraft = (id: string, patch: Partial<Mapping>) => {
        setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? {}), ...patch } }))
    }

    const upsert = async (input: {
        event_name: string
        template_slug: string
        to_resolver: Mapping["to_resolver"]
        static_to: string | null
        enabled: boolean
    }) => {
        const r = await fetch("/admin/email/events", {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        })
        if (!r.ok) {
            const e = await r.json().catch(() => ({}))
            throw new Error(e.message || `Save failed (${r.status})`)
        }
    }

    const saveRow = async (row: Mapping) => {
        const merged = mergedRow(row)
        if (merged.to_resolver === "static" && !merged.static_to) {
            toast.error("Enter a static recipient for this event")
            return
        }
        setSavingId(row.id)
        try {
            await upsert({
                event_name: merged.event_name,
                template_slug: merged.template_slug,
                to_resolver: merged.to_resolver,
                static_to: merged.to_resolver === "static" ? merged.static_to : null,
                enabled: merged.enabled,
            })
            toast.success(`Saved "${merged.event_name}"`)
            await load()
        } catch (err: any) {
            toast.error("Couldn't save", { description: err?.message })
        } finally {
            setSavingId(null)
        }
    }

    const create = async () => {
        if (!newEvent || !newSlug) {
            toast.error("Event name and template are required")
            return
        }
        if (newResolver === "static" && !newStatic) {
            toast.error("Enter a static recipient")
            return
        }
        try {
            await upsert({
                event_name: newEvent.trim(),
                template_slug: newSlug,
                to_resolver: newResolver,
                static_to: newResolver === "static" ? newStatic : null,
                enabled: true,
            })
            setNewEvent("")
            setNewSlug("")
            setNewResolver("customer_email")
            setNewStatic("")
            toast.success("Binding created")
            await load()
        } catch (err: any) {
            toast.error("Couldn't create binding", { description: err?.message })
        }
    }

    return (
        <div className="flex flex-col gap-5">
            <div>
                <Heading level="h2">Event bindings</Heading>
                <Text className="text-ui-fg-muted" size="small">
                    Each row wires a Medusa event name to a template. When the event
                    fires, the configured template is rendered and sent to the recipient
                    picked by the resolver.
                </Text>
            </div>

            {/* New-binding form */}
            <div className="border border-ui-border-base rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div className="flex flex-col gap-1.5">
                    <Label>Event name</Label>
                    <Input
                        placeholder="e.g. customer.kyc_approved"
                        value={newEvent}
                        onChange={(e) => setNewEvent(e.target.value)}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label>Template</Label>
                    <Select value={newSlug} onValueChange={setNewSlug}>
                        <Select.Trigger>
                            <Select.Value placeholder="Pick a template" />
                        </Select.Trigger>
                        <Select.Content>
                            {templates.map((t) => (
                                <Select.Item key={t.slug} value={t.slug}>
                                    {t.name}
                                </Select.Item>
                            ))}
                        </Select.Content>
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label>Resolver</Label>
                    <Select
                        value={newResolver}
                        onValueChange={(v) =>
                            setNewResolver(v as Mapping["to_resolver"])
                        }
                    >
                        <Select.Trigger>
                            <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                            <Select.Item value="customer_email">Customer email</Select.Item>
                            <Select.Item value="admin_email">Admin email</Select.Item>
                            <Select.Item value="static">Static address</Select.Item>
                        </Select.Content>
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label>Static recipient</Label>
                    <Input
                        type="email"
                        placeholder="ops@risitex.com"
                        value={newStatic}
                        onChange={(e) => setNewStatic(e.target.value)}
                        disabled={newResolver !== "static"}
                    />
                </div>
                <Button onClick={create}>Add binding</Button>
            </div>

            {/* Existing bindings */}
            <div className="border border-ui-border-base rounded-lg overflow-hidden">
                <Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>Event</Table.HeaderCell>
                            <Table.HeaderCell>Template</Table.HeaderCell>
                            <Table.HeaderCell>Resolver</Table.HeaderCell>
                            <Table.HeaderCell>Static to</Table.HeaderCell>
                            <Table.HeaderCell>Enabled</Table.HeaderCell>
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
                        ) : mappings.length === 0 ? (
                            <Table.Row>
                                <Table.Cell colSpan={6}>
                                    <Text className="text-ui-fg-muted">
                                        No event bindings yet.
                                    </Text>
                                </Table.Cell>
                            </Table.Row>
                        ) : (
                            mappings.map((row) => {
                                const m = mergedRow(row)
                                const dirty = drafts[row.id] !== undefined
                                return (
                                    <Table.Row key={row.id}>
                                        <Table.Cell className="font-mono text-xs">
                                            {m.event_name}
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Select
                                                value={m.template_slug}
                                                onValueChange={(v) =>
                                                    setDraft(row.id, { template_slug: v })
                                                }
                                            >
                                                <Select.Trigger>
                                                    <Select.Value />
                                                </Select.Trigger>
                                                <Select.Content>
                                                    {templates.map((t) => (
                                                        <Select.Item key={t.slug} value={t.slug}>
                                                            {t.name}
                                                        </Select.Item>
                                                    ))}
                                                </Select.Content>
                                            </Select>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Select
                                                value={m.to_resolver}
                                                onValueChange={(v) =>
                                                    setDraft(row.id, {
                                                        to_resolver: v as Mapping["to_resolver"],
                                                    })
                                                }
                                            >
                                                <Select.Trigger>
                                                    <Select.Value />
                                                </Select.Trigger>
                                                <Select.Content>
                                                    <Select.Item value="customer_email">
                                                        Customer
                                                    </Select.Item>
                                                    <Select.Item value="admin_email">
                                                        Admin
                                                    </Select.Item>
                                                    <Select.Item value="static">Static</Select.Item>
                                                </Select.Content>
                                            </Select>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Input
                                                type="email"
                                                value={m.static_to ?? ""}
                                                onChange={(e) =>
                                                    setDraft(row.id, {
                                                        static_to: e.target.value || null,
                                                    })
                                                }
                                                placeholder={
                                                    m.to_resolver === "static" ? "ops@…" : "—"
                                                }
                                                disabled={m.to_resolver !== "static"}
                                            />
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Switch
                                                checked={m.enabled}
                                                onCheckedChange={(v) =>
                                                    setDraft(row.id, { enabled: !!v })
                                                }
                                            />
                                        </Table.Cell>
                                        <Table.Cell className="text-right">
                                            {dirty && (
                                                <div className="inline-flex items-center gap-2">
                                                    <Badge color="orange" size="2xsmall">
                                                        Unsaved
                                                    </Badge>
                                                    <Button
                                                        size="small"
                                                        onClick={() => saveRow(row)}
                                                        disabled={savingId === row.id}
                                                    >
                                                        {savingId === row.id ? "Saving…" : "Save"}
                                                    </Button>
                                                </div>
                                            )}
                                        </Table.Cell>
                                    </Table.Row>
                                )
                            })
                        )}
                    </Table.Body>
                </Table>
            </div>
        </div>
    )
}
