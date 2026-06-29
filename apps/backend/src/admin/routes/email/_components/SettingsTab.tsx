import React, { useEffect, useState } from "react"
import {
    Button,
    Input,
    Label,
    Switch,
    Text,
    Heading,
    Badge,
    toast,
} from "@medusajs/ui"

/**
 * SMTP settings form. Backing routes:
 *   GET  /admin/email/config
 *   PUT  /admin/email/config
 *   POST /admin/email/test   { dry_run, to? }
 *
 * Password UX: the input shows a placeholder when a ciphertext is
 * stored but never shows the plaintext. Typing a value replaces it,
 * leaving it blank keeps the existing password, and the "Clear" button
 * sends `null` to unset it.
 */
type ConfigView = {
    configured: boolean
    host: string | null
    port: number
    secure: boolean
    username: string | null
    password_set: boolean
    from_name: string | null
    from_email: string | null
    reply_to: string | null
    enabled: boolean
    last_test_at: string | Date | null
    last_test_ok: boolean | null
    last_test_error: string | null
}

type Draft = {
    host: string
    port: number
    secure: boolean
    username: string
    password: string // "" = unchanged
    from_name: string
    from_email: string
    reply_to: string
    enabled: boolean
}

const emptyDraft = (): Draft => ({
    host: "",
    port: 587,
    secure: false,
    username: "",
    password: "",
    from_name: "",
    from_email: "",
    reply_to: "",
    enabled: true,
})

export default function SettingsTab() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [view, setView] = useState<ConfigView | null>(null)
    const [draft, setDraft] = useState<Draft>(emptyDraft())
    const [testEmail, setTestEmail] = useState("")

    const load = async () => {
        setLoading(true)
        try {
            const r = await fetch("/admin/email/config", { credentials: "include" })
            const data = (await r.json()) as ConfigView
            setView(data)
            setDraft({
                host: data.host ?? "",
                port: data.port ?? 587,
                secure: !!data.secure,
                username: data.username ?? "",
                password: "",
                from_name: data.from_name ?? "",
                from_email: data.from_email ?? "",
                reply_to: data.reply_to ?? "",
                enabled: !!data.enabled,
            })
        } catch (err: any) {
            toast.error("Failed to load SMTP config", {
                description: err?.message ?? "Unknown error",
            })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])

    const save = async (passwordOverride?: string | null) => {
        setSaving(true)
        try {
            const body: any = {
                host: draft.host,
                port: draft.port,
                secure: draft.secure,
                username: draft.username || null,
                from_name: draft.from_name || null,
                from_email: draft.from_email,
                reply_to: draft.reply_to || null,
                enabled: draft.enabled,
            }
            if (passwordOverride === null) {
                body.password = null
            } else if (draft.password.length > 0) {
                body.password = draft.password
            }
            const r = await fetch("/admin/email/config", {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
            if (!r.ok) {
                const e = await r.json().catch(() => ({}))
                throw new Error(e.message || `Save failed (${r.status})`)
            }
            const data = (await r.json()) as ConfigView
            setView(data)
            setDraft((d) => ({ ...d, password: "" }))
            toast.success("SMTP config saved")
        } catch (err: any) {
            toast.error("Couldn't save SMTP config", { description: err?.message })
        } finally {
            setSaving(false)
        }
    }

    const runTest = async (dryRun: boolean) => {
        if (!dryRun && !testEmail) {
            toast.error("Enter a recipient for the live test")
            return
        }
        setTesting(true)
        try {
            const r = await fetch("/admin/email/test", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dry_run: dryRun, to: dryRun ? undefined : testEmail }),
            })
            const data = await r.json()
            if (data.ok) {
                toast.success("SMTP test passed", { description: data.message })
            } else {
                toast.error("SMTP test failed", { description: data.message })
            }
            load()
        } catch (err: any) {
            toast.error("SMTP test failed", { description: err?.message })
        } finally {
            setTesting(false)
        }
    }

    if (loading) {
        return <Text className="text-ui-fg-muted">Loading SMTP settings…</Text>
    }

    const testStatus = view?.last_test_at
        ? view.last_test_ok
            ? { color: "green" as const, label: "Last test: OK" }
            : { color: "red" as const, label: "Last test: Failed" }
        : { color: "grey" as const, label: "Never tested" }

    // True when the form has edits the user hasn't saved yet. We diff
    // against the loaded `view` so the user can tell the toggle they
    // just flipped is local-only — the master switch in particular is
    // easy to misread because the UI control looks "on" the moment you
    // click it, but transactional mail stays paused until Save.
    const hasUnsavedChanges =
        !!view &&
        (draft.host !== (view.host ?? "") ||
            draft.port !== (view.port ?? 587) ||
            draft.secure !== !!view.secure ||
            draft.username !== (view.username ?? "") ||
            draft.from_name !== (view.from_name ?? "") ||
            draft.from_email !== (view.from_email ?? "") ||
            draft.reply_to !== (view.reply_to ?? "") ||
            draft.enabled !== !!view.enabled ||
            draft.password.length > 0)

    // Decryption failures from event-driven sends don't write to
    // last_test_error — they only show in server logs. Surface a hint
    // that re-typing the password will re-encrypt under the current key.
    const looksLikeDecryptError =
        !!view?.last_test_error &&
        /decrypt|encryption key|key.*rotat/i.test(view.last_test_error)

    return (
        <div className="flex flex-col gap-6 max-w-3xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <Heading level="h2">SMTP connection</Heading>
                    <Text className="text-ui-fg-muted" size="small">
                        Outgoing email runs through one SMTP connection, shared by every
                        transactional template. Password is encrypted at rest.
                    </Text>
                </div>
                <Badge color={testStatus.color}>{testStatus.label}</Badge>
            </div>

            {/* Master-switch banner — the single most important fact on
                this page is "are automated emails actually being sent
                right now?" so we lift it out of the form into a colored
                banner that mirrors the persisted state, not the draft. */}
            {view && (
                <div
                    className={
                        "rounded-lg border p-3 flex items-start gap-3 " +
                        (view.enabled
                            ? "border-ui-tag-green-border bg-ui-tag-green-bg"
                            : "border-ui-tag-orange-border bg-ui-tag-orange-bg")
                    }
                >
                    <div className="mt-0.5">
                        <span
                            className={
                                "inline-block h-2.5 w-2.5 rounded-full " +
                                (view.enabled ? "bg-ui-tag-green-icon" : "bg-ui-tag-orange-icon")
                            }
                        />
                    </div>
                    <div className="flex-1">
                        <Text size="small" className="font-medium">
                            {view.enabled
                                ? "Automated emails are being sent."
                                : "Automated emails are paused."}
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-muted">
                            {view.enabled
                                ? "Password resets, order confirmations, KYC, and account notifications are flowing through this SMTP connection."
                                : "Password resets, order confirmations, and other automatic emails will not be delivered until you turn the master switch below back on and save."}
                        </Text>
                    </div>
                </div>
            )}

            {hasUnsavedChanges && (
                <div className="rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg p-3">
                    <Text size="small" className="font-medium">
                        Unsaved changes
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-muted">
                        These edits are local to this form. Click <b>Save settings</b> below
                        to apply them — toggles do not take effect until you save.
                    </Text>
                </div>
            )}

            {looksLikeDecryptError && (
                <div className="rounded-lg border border-ui-border-error bg-ui-tag-red-bg p-3">
                    <Text size="small" className="font-medium text-ui-fg-error">
                        Stored SMTP password can&apos;t be decrypted.
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                        The at-rest encryption key has changed since this password was last
                        saved. Re-type the SMTP password below and click{" "}
                        <b>Save settings</b> — it will be re-encrypted with the current key
                        and automated emails will resume.
                    </Text>
                </div>
            )}

            {view?.last_test_error && !looksLikeDecryptError && (
                <div className="rounded-lg border border-ui-border-error bg-ui-bg-subtle-pressed/40 p-3">
                    <Text size="xsmall" className="font-mono text-ui-fg-error">
                        {view.last_test_error}
                    </Text>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Host" hint="smtp.sendgrid.net, smtp.gmail.com, etc.">
                    <Input
                        value={draft.host}
                        onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                        placeholder="smtp.example.com"
                    />
                </Field>
                <Field label="Port">
                    <Input
                        type="number"
                        value={draft.port}
                        onChange={(e) =>
                            setDraft({ ...draft, port: Number.parseInt(e.target.value, 10) || 587 })
                        }
                        placeholder="587"
                    />
                </Field>
                <Field label="Username">
                    <Input
                        value={draft.username}
                        onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                        placeholder="apikey, login, or leave blank"
                    />
                </Field>
                <Field
                    label="Password"
                    hint={
                        view?.password_set
                            ? "A password is stored. Leave blank to keep it, or type a new one to replace."
                            : "No password stored yet."
                    }
                >
                    <div className="flex items-center gap-2">
                        <Input
                            type="password"
                            value={draft.password}
                            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                            placeholder={view?.password_set ? "••••••••" : "Paste SMTP password"}
                        />
                        {view?.password_set && (
                            <Button
                                size="small"
                                variant="secondary"
                                onClick={() => save(null)}
                                disabled={saving}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                </Field>
                <Field label="From email">
                    <Input
                        type="email"
                        value={draft.from_email}
                        onChange={(e) => setDraft({ ...draft, from_email: e.target.value })}
                        placeholder="no-reply@risitex.com"
                    />
                </Field>
                <Field label="From name">
                    <Input
                        value={draft.from_name}
                        onChange={(e) => setDraft({ ...draft, from_name: e.target.value })}
                        placeholder="RISITEX"
                    />
                </Field>
                <Field label="Reply-to" hint="Optional — where replies should land.">
                    <Input
                        type="email"
                        value={draft.reply_to}
                        onChange={(e) => setDraft({ ...draft, reply_to: e.target.value })}
                        placeholder="support@risitex.com"
                    />
                </Field>
                <Field
                    label="Connection security"
                    hint="Most providers (SendGrid, Mailgun, Emailit) accept both — STARTTLS on 587 is the modern default."
                >
                    <div className="flex items-center gap-3 pt-1.5">
                        <Switch
                            checked={draft.secure}
                            onCheckedChange={(v) => setDraft({ ...draft, secure: !!v })}
                        />
                        <Label className="!text-ui-fg-base !font-normal">
                            {draft.secure
                                ? "Implicit TLS (port 465)"
                                : "STARTTLS upgrade (port 587)"}
                        </Label>
                    </div>
                </Field>
            </div>

            {/* Master switch — its own block so users can't miss it.
                The label flips with the toggle state so "what does ON
                actually mean here?" is answered visually. */}
            <div className="rounded-lg border border-ui-border-base p-4 flex items-start gap-3">
                <Switch
                    checked={draft.enabled}
                    onCheckedChange={(v) => setDraft({ ...draft, enabled: !!v })}
                    className="mt-0.5"
                />
                <div className="flex-1">
                    <Label className="!font-medium">
                        {draft.enabled
                            ? "Send automated emails"
                            : "Pause all automated emails"}
                    </Label>
                    <Text size="xsmall" className="text-ui-fg-muted">
                        Master kill switch. When off, password resets, order
                        confirmations, KYC, and account notifications are skipped —
                        the test buttons below still work, so you can verify config
                        without sending live mail.
                    </Text>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    onClick={() => {
                        if (!draft.enabled) {
                            const ok = window.confirm(
                                "Save with automated emails turned OFF?\n\n" +
                                    "Password resets, order confirmations and other " +
                                    "transactional emails will stop being delivered until " +
                                    "you turn this back on.",
                            )
                            if (!ok) return
                        }
                        save()
                    }}
                    disabled={saving}
                >
                    {saving ? "Saving…" : "Save settings"}
                </Button>
                <Button variant="secondary" onClick={load} disabled={saving}>
                    Revert
                </Button>
            </div>

            <div className="h-px bg-ui-border-base my-2" />

            <div>
                <Heading level="h3">Test connection</Heading>
                <Text className="text-ui-fg-muted" size="small">
                    Dry-run verifies the handshake without sending. Live test sends a one-line
                    email to the address below.
                </Text>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="max-w-xs"
                    />
                    <Button
                        variant="secondary"
                        onClick={() => runTest(true)}
                        disabled={testing || !view?.configured}
                    >
                        {testing ? "Testing…" : "Dry-run"}
                    </Button>
                    <Button
                        onClick={() => runTest(false)}
                        disabled={testing || !view?.configured || !testEmail}
                    >
                        {testing ? "Sending…" : "Send test email"}
                    </Button>
                </div>
            </div>
        </div>
    )
}

function Field({
    label,
    hint,
    children,
}: {
    label: string
    hint?: string
    children: React.ReactNode
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="font-medium">{label}</Label>
            {children}
            {hint && (
                <Text size="xsmall" className="text-ui-fg-muted">
                    {hint}
                </Text>
            )}
        </div>
    )
}
