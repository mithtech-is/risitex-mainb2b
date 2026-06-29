import React, { useEffect, useMemo, useState } from "react"
import {
    Button,
    Input,
    Label,
    Text,
    Heading,
    Textarea,
    Badge,
    toast,
} from "@medusajs/ui"

/**
 * Two-pane template editor.
 *   Left: list of templates (system rows get a "System" badge and can't
 *         be renamed/deleted via the UI, only edited in place).
 *   Right: subject / html / description editor + a live preview compiled
 *         with the template's `sample_data`.
 *
 * Preview uses a lightweight `{{var}}` substitution on the client — good
 * enough for "does this render". Real sends use Handlebars on the server.
 */

type Template = {
    id: string
    slug: string
    name: string
    subject: string
    html: string
    description: string | null
    sample_data: Record<string, any> | null
    is_system: boolean
}

type Draft = Pick<
    Template,
    "name" | "subject" | "html" | "description" | "sample_data"
>

const emptyDraft: Draft = {
    name: "",
    subject: "",
    html: "",
    description: "",
    sample_data: {},
}

function interpolate(input: string, data: Record<string, any>): string {
    if (!input) return ""
    return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
        const parts = String(key).split(".")
        let cur: any = data
        for (const p of parts) {
            if (cur == null) return m
            cur = cur[p]
        }
        return cur == null ? m : String(cur)
    })
}

export default function TemplatesTab() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [templates, setTemplates] = useState<Template[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    const [draft, setDraft] = useState<Draft>(emptyDraft)
    const [sampleText, setSampleText] = useState("{}")
    const [sampleError, setSampleError] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [newSlug, setNewSlug] = useState("")
    const [newName, setNewName] = useState("")

    const active = useMemo(
        () => templates.find((t) => t.id === activeId) ?? null,
        [templates, activeId],
    )

    const loadList = async (focusId?: string) => {
        setLoading(true)
        try {
            const r = await fetch("/admin/email/templates", { credentials: "include" })
            const data = (await r.json()) as { templates: Template[] }
            setTemplates(data.templates || [])
            const next = focusId ?? activeId ?? data.templates?.[0]?.id ?? null
            setActiveId(next)
        } catch (err: any) {
            toast.error("Failed to load templates", { description: err?.message })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadList()
    }, [])

    // Sync the editor draft whenever the active template changes.
    useEffect(() => {
        if (!active) {
            setDraft(emptyDraft)
            setSampleText("{}")
            setSampleError(null)
            return
        }
        setDraft({
            name: active.name,
            subject: active.subject,
            html: active.html,
            description: active.description ?? "",
            sample_data: active.sample_data ?? {},
        })
        setSampleText(JSON.stringify(active.sample_data ?? {}, null, 2))
        setSampleError(null)
    }, [activeId, active?.id])

    const save = async () => {
        if (!active) return
        // Re-parse the sample-data JSON on save so a bad edit doesn't
        // silently ship.
        let sample: Record<string, any> | null = null
        try {
            const parsed = sampleText.trim().length ? JSON.parse(sampleText) : null
            if (parsed != null && typeof parsed !== "object") {
                throw new Error("Sample data must be a JSON object")
            }
            sample = parsed
            setSampleError(null)
        } catch (err: any) {
            setSampleError(err?.message || "Invalid JSON")
            toast.error("Sample data must be valid JSON")
            return
        }
        setSaving(true)
        try {
            const body = {
                name: draft.name,
                subject: draft.subject,
                html: draft.html,
                description: draft.description ?? null,
                sample_data: sample,
            }
            const r = await fetch(`/admin/email/templates/${active.id}`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
            if (!r.ok) {
                const e = await r.json().catch(() => ({}))
                throw new Error(e.message || `Save failed (${r.status})`)
            }
            toast.success("Template saved")
            await loadList(active.id)
        } catch (err: any) {
            toast.error("Couldn't save template", { description: err?.message })
        } finally {
            setSaving(false)
        }
    }

    const remove = async () => {
        if (!active || active.is_system) return
        const confirmed = window.confirm(
            `Delete template "${active.name}"? This cannot be undone.`,
        )
        if (!confirmed) return
        try {
            const r = await fetch(`/admin/email/templates/${active.id}`, {
                method: "DELETE",
                credentials: "include",
            })
            if (!r.ok) {
                const e = await r.json().catch(() => ({}))
                throw new Error(e.message || `Delete failed (${r.status})`)
            }
            toast.success("Template deleted")
            setActiveId(null)
            await loadList()
        } catch (err: any) {
            toast.error("Couldn't delete template", { description: err?.message })
        }
    }

    const create = async () => {
        if (!newSlug || !newName) {
            toast.error("Slug and name are required")
            return
        }
        try {
            const r = await fetch("/admin/email/templates", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slug: newSlug.toLowerCase(),
                    name: newName,
                    subject: `${newName} — {{customer.first_name}}`,
                    html: "<p>Hello {{customer.first_name}},</p><p>Edit this template to get started.</p>",
                    description: null,
                    sample_data: { customer: { first_name: "Alex" } },
                }),
            })
            if (!r.ok) {
                const e = await r.json().catch(() => ({}))
                throw new Error(e.message || `Create failed (${r.status})`)
            }
            const { template } = (await r.json()) as { template: Template }
            setNewSlug("")
            setNewName("")
            setCreating(false)
            toast.success("Template created")
            await loadList(template.id)
        } catch (err: any) {
            toast.error("Couldn't create template", { description: err?.message })
        }
    }

    // Live-preview context — prefer the editor's sample text if it parses,
    // else fall back to the saved sample_data.
    const previewContext = useMemo(() => {
        try {
            const parsed = sampleText.trim().length ? JSON.parse(sampleText) : {}
            return parsed && typeof parsed === "object" ? parsed : {}
        } catch {
            return active?.sample_data ?? {}
        }
    }, [sampleText, active?.sample_data])

    const previewSubject = useMemo(
        () => interpolate(draft.subject, previewContext),
        [draft.subject, previewContext],
    )
    const previewHtml = useMemo(
        () => interpolate(draft.html, previewContext),
        [draft.html, previewContext],
    )

    /**
     * The iframe renders from a Blob URL instead of `srcDoc`.
     * Reason: under Medusa admin's strict CSP, sandboxed `srcDoc`
     * iframes render blank in some browsers. A Blob URL gives the
     * frame a real (blob:) origin the CSP treats as same-origin, so
     * HTML + inline styles render reliably.
     *
     * We keep `sandbox="allow-same-origin"` so stray <script> tags in
     * an edited template still can't execute.
     */
    const [previewUrl, setPreviewUrl] = useState<string>("")
    useEffect(() => {
        if (!previewHtml) {
            setPreviewUrl("")
            return
        }
        const blob = new Blob([previewHtml], { type: "text/html;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        setPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [previewHtml])

    return (
        <div className="grid grid-cols-12 gap-4">
            {/* List pane */}
            <div className="col-span-4 border border-ui-border-base rounded-lg overflow-hidden flex flex-col">
                <div className="p-3 border-b border-ui-border-base flex items-center justify-between">
                    <Heading level="h3">Templates</Heading>
                    <Button size="small" onClick={() => setCreating((v) => !v)}>
                        {creating ? "Cancel" : "New"}
                    </Button>
                </div>
                {creating && (
                    <div className="p-3 border-b border-ui-border-base flex flex-col gap-2 bg-ui-bg-subtle">
                        <Input
                            placeholder="slug (lowercase, e.g. welcome-email)"
                            value={newSlug}
                            onChange={(e) =>
                                setNewSlug(
                                    e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "-"),
                                )
                            }
                        />
                        <Input
                            placeholder="Display name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                        />
                        <Button size="small" onClick={create}>
                            Create template
                        </Button>
                    </div>
                )}
                <div className="overflow-y-auto flex-1 max-h-[65vh]">
                    {loading ? (
                        <div className="p-4">
                            <Text className="text-ui-fg-muted">Loading…</Text>
                        </div>
                    ) : templates.length === 0 ? (
                        <div className="p-4">
                            <Text className="text-ui-fg-muted">No templates yet.</Text>
                        </div>
                    ) : (
                        templates.map((t) => {
                            const selected = t.id === activeId
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setActiveId(t.id)}
                                    className={`w-full text-left px-3 py-2.5 border-b border-ui-border-base hover:bg-ui-bg-base-hover transition-colors ${
                                        selected ? "bg-ui-bg-subtle" : ""
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-ui-fg-base truncate">
                                            {t.name}
                                        </span>
                                        {t.is_system && <Badge size="2xsmall">System</Badge>}
                                    </div>
                                    <div className="text-xs text-ui-fg-muted font-mono truncate">
                                        {t.slug}
                                    </div>
                                </button>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Editor + preview pane */}
            <div className="col-span-8 flex flex-col gap-4">
                {!active ? (
                    <div className="border border-ui-border-base rounded-lg p-6">
                        <Text className="text-ui-fg-muted">
                            Select a template on the left to edit, or create a new one.
                        </Text>
                    </div>
                ) : (
                    <>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <Heading level="h2">{active.name}</Heading>
                                <Text className="text-ui-fg-muted" size="small">
                                    Slug <span className="font-mono">{active.slug}</span>
                                    {active.is_system && (
                                        <>
                                            {" · "}
                                            <Badge size="2xsmall">System</Badge>
                                        </>
                                    )}
                                </Text>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button onClick={save} disabled={saving}>
                                    {saving ? "Saving…" : "Save"}
                                </Button>
                                {!active.is_system && (
                                    <Button variant="danger" onClick={remove}>
                                        Delete
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <Label>Name</Label>
                                <Input
                                    value={draft.name}
                                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label>Description</Label>
                                <Input
                                    value={draft.description ?? ""}
                                    onChange={(e) =>
                                        setDraft({ ...draft, description: e.target.value })
                                    }
                                    placeholder="Shown in the list view"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label>Subject</Label>
                            <Input
                                value={draft.subject}
                                onChange={(e) =>
                                    setDraft({ ...draft, subject: e.target.value })
                                }
                                placeholder="e.g. Welcome to RISITEX, {{customer.first_name}}"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <Label>HTML body</Label>
                                <Textarea
                                    value={draft.html}
                                    onChange={(e) =>
                                        setDraft({ ...draft, html: e.target.value })
                                    }
                                    rows={16}
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label>
                                    Sample data{" "}
                                    <span className="text-ui-fg-muted font-normal">(JSON)</span>
                                </Label>
                                <Textarea
                                    value={sampleText}
                                    onChange={(e) => setSampleText(e.target.value)}
                                    rows={16}
                                    className={`font-mono text-xs ${
                                        sampleError ? "border-ui-border-error" : ""
                                    }`}
                                />
                                {sampleError && (
                                    <Text size="xsmall" className="text-ui-fg-error">
                                        {sampleError}
                                    </Text>
                                )}
                            </div>
                        </div>

                        <div className="border border-ui-border-base rounded-lg overflow-hidden">
                            <div className="px-3 py-2 border-b border-ui-border-base bg-ui-bg-subtle flex items-center justify-between">
                                <span className="text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                                    Preview
                                </span>
                                <span className="text-xs text-ui-fg-muted font-mono">
                                    Subject: {previewSubject || <em>(empty)</em>}
                                </span>
                            </div>
                            <iframe
                                title={`Preview of ${active.slug}`}
                                className="w-full h-[32rem] bg-white"
                                src={previewUrl || "about:blank"}
                                sandbox="allow-same-origin"
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
