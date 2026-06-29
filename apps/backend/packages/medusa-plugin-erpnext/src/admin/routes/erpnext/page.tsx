import React, { useCallback, useEffect, useMemo, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  StatusBadge,
  Switch,
  Text,
  Textarea,
} from "@medusajs/ui"
import { ArrowsPointingOut, Plus, Trash } from "@medusajs/icons"

/**
 * /app/erpnext — ERPNext / Frappe sync admin page.
 *
 * Tabs:
 *   - Settings : URL, webhook secret, API key/secret, retry knobs.
 *                "Test connection" pings frappe.auth.get_logged_user.
 *   - Push     : manual fan-out of customers / orders / products /
 *                customer KYC. Useful for back-fill, repaving after a
 *                Frappe-side outage, or pushing entities that predate
 *                the live event-bus subscriber.
 *   - Pull     : preview ERPNext doctype rows via the Frappe resource
 *                API (Item by default). Read-only — the write-back-to-
 *                Medusa half is intentionally an operator decision.
 *   - Events   : the `erpnext_sync_event` log with status filters and a
 *                per-row retry button.
 */

type SettingsView = {
  exists: boolean
  enable_sync: boolean
  erpnext_url: string | null
  webhook_secret_masked: string | null
  frappe_to_medusa_secret_masked: string | null
  erpnext_api_key_masked: string | null
  erpnext_api_secret_masked: string | null
  request_timeout_ms: number
  auto_retry_failed: boolean
  auto_retry_max_attempts: number
  auto_retry_min_interval_minutes: number
  last_full_resync_at: string | null
  notes: string | null
  updated_by_user_id: string | null
  env_fallback: {
    erpnext_url: string | null
    webhook_secret_present: boolean
  }
}

type EventRow = {
  id: string
  event: string
  event_id: string
  status: "pending" | "success" | "failed" | "skipped"
  attempts: number
  last_attempt_at: string | null
  succeeded_at: string | null
  last_error: string | null
  target_url: string | null
}

type Tab = "settings" | "mappings" | "schema" | "pull" | "events"

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "settings", label: "Settings" },
  // Mappings — Medusa-side `erpnext_mapping` rows, edited via the
  // doctype-introspection mapper at the bottom of this file.
  // Replaces the earlier Frappe-proxy MappingsTab (dead code retained
  // briefly below the new component for reference; remove once the
  // new editor is battle-tested).
  { key: "mappings", label: "Mappings" },
  // Schema Explorer — read-only side-by-side of Medusa entity fields
  // and Frappe doctype fields. Makes building a mapping easier: find
  // the exact dot-path / fieldname without leaving the admin.
  { key: "schema", label: "Schema Explorer" },
  { key: "pull", label: "Pull" },
  { key: "events", label: "Events" },
]

const ErpnextPage = () => {
  const [tab, setTab] = useState<Tab>("settings")
  const [view, setView] = useState<SettingsView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/admin/erpnext/settings", {
        credentials: "include",
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message || "load_failed")
      setView(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <Container>
      <div className="mb-4 flex items-center gap-2">
        <ArrowsPointingOut />
        <Heading level="h1">ERPNext sync</Heading>
        {view?.enable_sync ? (
          <StatusBadge color="green">on</StatusBadge>
        ) : (
          <StatusBadge color="grey">off</StatusBadge>
        )}
      </div>
      <Text size="small" className="text-ui-fg-subtle mb-4">
        Bidirectional sync with the RISITEX Frappe app (risitex_erp).
        Push fires on every Medusa event automatically; the buttons here
        are for back-fill or replay. Pull is read-only — review then
        decide what to write back into Medusa.
      </Text>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700">
          <Text>{error}</Text>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "primary" : "secondary"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {!view && loading && <Text>Loading…</Text>}
      {view && tab === "settings" && (
        <SettingsTab view={view} onSaved={(v) => setView(v)} />
      )}
      {view && tab === "mappings" && <MappingsTab onJumpToTab={setTab} />}
      {view && tab === "schema" && <SchemaTab />}
      {view && tab === "pull" && <PullTab />}
      {view && tab === "events" && <EventsTab />}
    </Container>
  )
}

// ─────────────────────────────────────────────────────────────────
// Settings tab
// ─────────────────────────────────────────────────────────────────

const SettingsTab: React.FC<{
  view: SettingsView
  onSaved: (v: SettingsView) => void
}> = ({ view, onSaved }) => {
  const [enableSync, setEnableSync] = useState(view.enable_sync)
  const [url, setUrl] = useState(view.erpnext_url ?? "")
  // Three secret fields. Empty = leave-as-is, null sentinel = clear,
  // value = update. Mirrors cashfree-settings UX.
  const [webhookSecret, setWebhookSecret] = useState("")
  const [frappeToMedusaSecret, setFrappeToMedusaSecret] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [timeoutMs, setTimeoutMs] = useState(view.request_timeout_ms)
  const [autoRetry, setAutoRetry] = useState(view.auto_retry_failed)
  const [retryMax, setRetryMax] = useState(view.auto_retry_max_attempts)
  const [retryInterval, setRetryInterval] = useState(
    view.auto_retry_min_interval_minutes,
  )
  const [notes, setNotes] = useState(view.notes ?? "")
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pingResult, setPingResult] = useState<{
    ok: boolean
    message?: string
    user?: string
    httpStatus?: number
  } | null>(null)
  const [pinging, setPinging] = useState(false)

  useEffect(() => {
    setEnableSync(view.enable_sync)
    setUrl(view.erpnext_url ?? "")
    setWebhookSecret("")
    setFrappeToMedusaSecret("")
    setApiKey("")
    setApiSecret("")
    setTimeoutMs(view.request_timeout_ms)
    setAutoRetry(view.auto_retry_failed)
    setRetryMax(view.auto_retry_max_attempts)
    setRetryInterval(view.auto_retry_min_interval_minutes)
    setNotes(view.notes ?? "")
  }, [view])

  const save = async () => {
    setSaving(true)
    setErr(null)
    setFlash(null)
    try {
      const body: Record<string, unknown> = {
        enable_sync: enableSync,
        erpnext_url: url.trim() || null,
        request_timeout_ms: timeoutMs,
        auto_retry_failed: autoRetry,
        auto_retry_max_attempts: retryMax,
        auto_retry_min_interval_minutes: retryInterval,
        notes: notes.trim() || null,
      }
      // Only include secret fields if user typed something — empty
      // string would mean "leave as-is" but the API treats absent the
      // same way, so just don't send them.
      if (webhookSecret) body.webhook_secret = webhookSecret
      if (frappeToMedusaSecret)
        body.frappe_to_medusa_secret = frappeToMedusaSecret
      if (apiKey) body.erpnext_api_key = apiKey
      if (apiSecret) body.erpnext_api_secret = apiSecret

      const res = await fetch("/admin/erpnext/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "save_failed")
      onSaved(data)
      setFlash("Saved")
      setTimeout(() => setFlash(null), 2500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save_failed")
    } finally {
      setSaving(false)
    }
  }

  const ping = async () => {
    setPinging(true)
    setPingResult(null)
    try {
      const res = await fetch("/admin/erpnext/ping", {
        method: "POST",
        credentials: "include",
      })
      const body = await res.json()
      setPingResult(body)
    } catch (e) {
      setPingResult({
        ok: false,
        message: e instanceof Error ? e.message : "ping_failed",
      })
    } finally {
      setPinging(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded border border-ui-border-base p-4">
        <div className="mb-3 flex items-center justify-between">
          <Heading level="h2">Connection</Heading>
          <div className="flex items-center gap-2">
            <Label className="text-ui-fg-subtle">Sync enabled</Label>
            <Switch checked={enableSync} onCheckedChange={setEnableSync} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label>ERPNext URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://erp.example.com"
            />
            {view.env_fallback.erpnext_url && (
              <Text size="small" className="text-ui-fg-subtle">
                Env fallback: {view.env_fallback.erpnext_url}
              </Text>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label>Medusa → Frappe secret</Label>
              <Input
                type="password"
                placeholder={view.webhook_secret_masked ?? "(unset)"}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
              <Text size="small" className="text-ui-fg-subtle">
                HMAC for outbound (Medusa→Frappe) pushes. Must match
                the `medusa_webhook_secret` in the Frappe site_config.json
                (see docs/erp-owner-actions.md).
              </Text>
            </div>
            <div>
              <Label>Frappe → Medusa secret</Label>
              <Input
                type="password"
                placeholder={
                  view.frappe_to_medusa_secret_masked ?? "(unset)"
                }
                value={frappeToMedusaSecret}
                onChange={(e) => setFrappeToMedusaSecret(e.target.value)}
              />
              <Text size="small" className="text-ui-fg-subtle">
                HMAC for inbound (Frappe→Medusa) Webhook rows. Each
                Frappe Webhook seeded by F2 signs with this value.
              </Text>
            </div>
            <div>
              <Label>API key</Label>
              <Input
                placeholder={view.erpnext_api_key_masked ?? "(unset)"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Label className="mt-2">API secret</Label>
              <Input
                type="password"
                placeholder={view.erpnext_api_secret_masked ?? "(unset)"}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
              />
              <Text size="small" className="text-ui-fg-subtle">
                Token-auth for REST pulls + the seeders.
              </Text>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={saving} variant="primary">
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button onClick={ping} disabled={pinging} variant="secondary">
            {pinging ? "Pinging…" : "Test connection"}
          </Button>
          <Button
            onClick={async () => {
              setErr(null)
              const r = await fetch("/admin/erpnext/seed-mappings", {
                method: "POST",
                credentials: "include",
              })
              const b = await r.json()
              setFlash(
                `Mappings seeded: ${b.seeded?.length ?? 0}, skipped: ${b.skipped?.length ?? 0}, errors: ${b.errors?.length ?? 0}`,
              )
            }}
            variant="secondary"
          >
            Reseed canonical mappings
          </Button>
          <Button
            onClick={async () => {
              setErr(null)
              const r = await fetch(
                "/admin/erpnext/seed-frappe-webhooks",
                {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    medusa_base_url:
                      window.location.origin || undefined,
                  }),
                },
              )
              const b = await r.json()
              if (r.ok) {
                setFlash(
                  `Frappe webhooks seeded: ${b.seeded?.length ?? 0}, skipped: ${b.skipped?.length ?? 0}, errors: ${b.errors?.length ?? 0}`,
                )
              } else {
                setErr(b.message ?? "seed_frappe_webhooks_failed")
              }
            }}
            variant="secondary"
          >
            Reseed Frappe webhooks
          </Button>
          {flash && <StatusBadge color="green">{flash}</StatusBadge>}
          {err && (
            <Text size="small" className="text-red-600">
              {err}
            </Text>
          )}
        </div>

        {pingResult && (
          <div
            className={`mt-3 rounded border px-3 py-2 ${
              pingResult.ok
                ? "border-green-200 bg-green-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <Text size="small">
              {pingResult.ok
                ? `OK · authenticated as ${pingResult.user ?? "(unknown)"}`
                : `Failed${pingResult.httpStatus ? ` (HTTP ${pingResult.httpStatus})` : ""}: ${pingResult.message}`}
            </Text>
          </div>
        )}
      </section>

      <section className="rounded border border-ui-border-base p-4">
        <Heading level="h2" className="mb-3">
          Retry & timeouts
        </Heading>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <Label>Request timeout (ms)</Label>
            <Input
              type="number"
              min={1000}
              max={120_000}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Auto-retry max attempts</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={retryMax}
              onChange={(e) => setRetryMax(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Auto-retry interval (min)</Label>
            <Input
              type="number"
              min={1}
              max={1440}
              value={retryInterval}
              onChange={(e) =>
                setRetryInterval(Number(e.target.value) || 0)
              }
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Label className="text-ui-fg-subtle">Auto-retry failed events</Label>
          <Switch checked={autoRetry} onCheckedChange={setAutoRetry} />
        </div>
      </section>

      <section className="rounded border border-ui-border-base p-4">
        <Heading level="h2" className="mb-3">
          Notes
        </Heading>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything ops should know about this Frappe instance…"
        />
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SectionRunSync — per-section "Run sync" panel rendered inside the
// Mappings tab. Replaces the standalone Push tab from Phase 1.
// Calls the same /admin/erpnext/push/{customers,orders,products}
// endpoints under the hood, routed via the section's syncEndpoint
// metadata (see MAPPING_SECTIONS).
// ─────────────────────────────────────────────────────────────────

type PushOutcome = {
  total: number
  success: number
  failed: number
  skipped: number
}

const SectionRunSync: React.FC<{
  section: { syncIdKey: string; syncEndpoint: string }
}> = ({ section }) => {
  const [ids, setIds] = useState("")
  const [limit, setLimit] = useState<number>(200)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [includeKyc, setIncludeKyc] = useState(true)

  const run = async () => {
    setRunning(true)
    setErr(null)
    setResult(null)
    try {
      const trimmed = ids
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const body: Record<string, unknown> = {}
      if (trimmed.length > 0) body[section.syncIdKey] = trimmed
      else body.limit = limit
      // Customer push has an extra knob for the KYC sub-event. The
      // bank/demat sections also call the customers endpoint and
      // re-use the same toggle (their data flows inside the same
      // customer payload).
      if (section.syncEndpoint.endsWith("/customers")) {
        body.include_kyc = includeKyc
      }
      const res = await fetch(section.syncEndpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "sync_failed")
      setResult(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "sync_failed")
    } finally {
      setRunning(false)
    }
  }

  // Different endpoints wrap their counts differently — pick whichever
  // shape is present.
  const summary: PushOutcome | null = useMemo(() => {
    if (!result) return null
    const r = result.customers ?? result
    if (typeof r?.total !== "number") return null
    return {
      total: r.total,
      success: r.success ?? 0,
      failed: r.failed ?? 0,
      skipped: r.skipped ?? 0,
    }
  }, [result])

  return (
    <div className="rounded border border-ui-border-base bg-ui-bg-subtle p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <Text size="small" weight="plus" className="uppercase tracking-wide">
          Run sync
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          POST {section.syncEndpoint}
        </Text>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <Label>{section.syncIdKey} (optional)</Label>
          <Input
            value={ids}
            onChange={(e) => setIds(e.target.value)}
            placeholder="leave blank to sync the most recent N"
            className="font-mono text-xs"
          />
        </div>
        <div>
          <Label>Limit (when no ids)</Label>
          <Input
            type="number"
            min={1}
            max={1000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-end gap-x-2">
          {section.syncEndpoint.endsWith("/customers") && (
            <div className="flex-1 flex items-center gap-2">
              <Switch
                checked={includeKyc}
                onCheckedChange={setIncludeKyc}
              />
              <Label className="text-ui-fg-subtle">Include KYC</Label>
            </div>
          )}
          <Button
            onClick={run}
            disabled={running}
            variant="primary"
            size="small"
          >
            {running ? "Syncing…" : "Run sync"}
          </Button>
        </div>
      </div>
      {(summary || err) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {summary && (
            <>
              <StatusBadge color="green">
                success {summary.success}
              </StatusBadge>
              <StatusBadge color={summary.failed > 0 ? "red" : "grey"}>
                failed {summary.failed}
              </StatusBadge>
              <StatusBadge color="grey">
                skipped {summary.skipped}
              </StatusBadge>
              <Text size="small" className="text-ui-fg-subtle">
                total {summary.total}
              </Text>
            </>
          )}
          {err && (
            <Text size="small" className="text-red-600">
              {err}
            </Text>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Schema Explorer tab
//
// Read-only side-by-side of Medusa entity fields (left) and Frappe
// doctype fields (right). Each row exposes the EXACT value you'd type
// into the Mappings editor — Medusa dot-path on the left, Frappe
// fieldname on the right — with a one-click copy. Removes the
// guesswork of hand-typing field names into a new mapping.
// ─────────────────────────────────────────────────────────────────

type MedusaEntityMeta = {
  key: string
  label: string
  module_name: string
  is_custom_module: boolean
  events: string[]
  default_key_path: string
  paths: Array<{
    path: string
    label: string
    type: string
    description?: string
    suggested_transform?: string
  }>
}

type FrappeField = {
  fieldname: string
  label?: string
  fieldtype: string
  reqd?: number | boolean
  options?: string | null
}

const SchemaTab: React.FC = () => {
  // ── Medusa side ──
  const [entities, setEntities] = useState<MedusaEntityMeta[] | null>(null)
  const [entityKey, setEntityKey] = useState<string>("")
  const [medusaSearch, setMedusaSearch] = useState("")

  // ── Frappe side ──
  const [doctype, setDoctype] = useState("Customer")
  const [frappeFields, setFrappeFields] = useState<FrappeField[] | null>(null)
  const [frappeLoading, setFrappeLoading] = useState(false)
  const [frappeError, setFrappeError] = useState<string | null>(null)
  const [frappeSearch, setFrappeSearch] = useState("")

  const [copied, setCopied] = useState<string | null>(null)

  const copy = (val: string) => {
    void navigator.clipboard?.writeText(val)
    setCopied(val)
    window.setTimeout(() => setCopied((c) => (c === val ? null : c)), 1200)
  }

  // Load the Medusa entity registry once.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/admin/erpnext/medusa-entities", {
          credentials: "include",
        })
        const body = await res.json()
        const items = (body.items ?? []) as MedusaEntityMeta[]
        setEntities(items)
        if (items.length && !entityKey) setEntityKey(items[0].key)
      } catch {
        setEntities([])
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadDoctype = useCallback(async (name: string) => {
    if (!name.trim()) return
    setFrappeLoading(true)
    setFrappeError(null)
    try {
      const res = await fetch(
        `/admin/erpnext/doctypes/${encodeURIComponent(name.trim())}`,
        { credentials: "include" },
      )
      const body = await res.json()
      if (!res.ok || body.ok === false) {
        setFrappeError(body.message ?? `Failed to load ${name}`)
        setFrappeFields(null)
      } else {
        setFrappeFields((body.fields ?? []) as FrappeField[])
      }
    } catch (err: any) {
      setFrappeError(err?.message ?? "Failed to load doctype")
      setFrappeFields(null)
    } finally {
      setFrappeLoading(false)
    }
  }, [])

  // Auto-load the default doctype on first render.
  useEffect(() => {
    void loadDoctype("Customer")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeEntity = useMemo(
    () => entities?.find((e) => e.key === entityKey) ?? null,
    [entities, entityKey],
  )
  const medusaPaths = useMemo(() => {
    const paths = activeEntity?.paths ?? []
    const q = medusaSearch.trim().toLowerCase()
    if (!q) return paths
    return paths.filter(
      (p) =>
        p.path.toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    )
  }, [activeEntity, medusaSearch])

  const filteredFrappe = useMemo(() => {
    const fields = frappeFields ?? []
    const q = frappeSearch.trim().toLowerCase()
    if (!q) return fields
    return fields.filter(
      (f) =>
        f.fieldname.toLowerCase().includes(q) ||
        (f.label ?? "").toLowerCase().includes(q) ||
        f.fieldtype.toLowerCase().includes(q),
    )
  }, [frappeFields, frappeSearch])

  const DOCTYPE_SHORTCUTS = [
    "Customer",
    "Item",
    "Sales Order",
    "Sales Invoice",
    "Delivery Note",
    "Bin",
    "RISITEX Customer Tier",
    "RISITEX Affiliate Partner",
    "RISITEX Commission Ledger",
    "RISITEX Wallet Settlement",
  ]

  return (
    <div>
      <Text size="small" className="text-ui-fg-subtle mb-4">
        Browse both sides of the integration. Left = Medusa entity
        dot-paths (curated in the registry). Right = live Frappe doctype
        fields. Click any value to copy it, then paste into the Mappings
        editor.
      </Text>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Medusa side ── */}
        <div className="rounded border border-ui-border-base bg-ui-bg-subtle p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Heading level="h3">Medusa entity</Heading>
            {activeEntity && (
              <StatusBadge
                color={activeEntity.is_custom_module ? "blue" : "grey"}
              >
                {activeEntity.module_name}
              </StatusBadge>
            )}
          </div>
          {entities === null ? (
            <Text size="small" className="text-ui-fg-subtle">
              Loading entities…
            </Text>
          ) : (
            <>
              <Select value={entityKey} onValueChange={setEntityKey}>
                <Select.Trigger>
                  <Select.Value placeholder="Pick an entity" />
                </Select.Trigger>
                <Select.Content>
                  {entities.map((e) => (
                    <Select.Item key={e.key} value={e.key}>
                      {e.label} ({e.key})
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>

              {activeEntity && (
                <div className="mt-2">
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Key path: <code>{activeEntity.default_key_path}</code> ·{" "}
                    {activeEntity.events.length} event
                    {activeEntity.events.length === 1 ? "" : "s"}
                  </Text>
                </div>
              )}

              <Input
                className="mt-3"
                placeholder="Filter fields…"
                value={medusaSearch}
                onChange={(e) => setMedusaSearch(e.target.value)}
              />

              <div className="mt-3 max-h-[26rem] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-ui-bg-subtle">
                    <tr className="text-ui-fg-subtle">
                      <th className="py-1 pr-2">Path</th>
                      <th className="py-1 pr-2">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medusaPaths.map((p) => (
                      <tr
                        key={p.path}
                        className="border-t border-ui-border-base hover:bg-ui-bg-base"
                      >
                        <td className="py-1 pr-2">
                          <button
                            type="button"
                            onClick={() => copy(p.path)}
                            className="text-left font-mono text-ui-fg-base hover:underline"
                            title="Copy path"
                          >
                            {copied === p.path ? "✓ copied" : p.path}
                          </button>
                          {p.label && p.label !== p.path && (
                            <div className="text-ui-fg-muted text-xs">
                              {p.label}
                            </div>
                          )}
                        </td>
                        <td className="py-1 pr-2 align-top">
                          <span className="text-ui-fg-subtle">{p.type}</span>
                          {p.suggested_transform && (
                            <div className="text-ui-fg-muted text-xs">
                              → {p.suggested_transform}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {medusaPaths.length === 0 && (
                      <tr>
                        <td colSpan={2} className="py-3 text-ui-fg-subtle">
                          No fields match.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Frappe side ── */}
        <div className="rounded border border-ui-border-base bg-ui-bg-subtle p-4">
          <Heading level="h3" className="mb-3">
            Frappe doctype
          </Heading>
          <div className="flex gap-2">
            <Input
              placeholder="Doctype name, e.g. Sales Order"
              value={doctype}
              onChange={(e) => setDoctype(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadDoctype(doctype)
              }}
            />
            <Button
              variant="secondary"
              isLoading={frappeLoading}
              onClick={() => void loadDoctype(doctype)}
            >
              Load
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {DOCTYPE_SHORTCUTS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDoctype(d)
                  void loadDoctype(d)
                }}
                className="rounded border border-ui-border-base bg-ui-bg-base px-2 py-0.5 text-xs text-ui-fg-subtle hover:bg-ui-bg-base-hover"
              >
                {d}
              </button>
            ))}
          </div>

          {frappeError && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {frappeError}
            </div>
          )}

          {frappeFields && (
            <>
              <Input
                className="mt-3"
                placeholder="Filter fields…"
                value={frappeSearch}
                onChange={(e) => setFrappeSearch(e.target.value)}
              />
              <div className="mt-3 max-h-[26rem] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-ui-bg-subtle">
                    <tr className="text-ui-fg-subtle">
                      <th className="py-1 pr-2">Fieldname</th>
                      <th className="py-1 pr-2">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFrappe.map((f) => (
                      <tr
                        key={f.fieldname}
                        className="border-t border-ui-border-base hover:bg-ui-bg-base"
                      >
                        <td className="py-1 pr-2">
                          <button
                            type="button"
                            onClick={() => copy(f.fieldname)}
                            className="text-left font-mono text-ui-fg-base hover:underline"
                            title="Copy fieldname"
                          >
                            {copied === f.fieldname
                              ? "✓ copied"
                              : f.fieldname}
                          </button>
                          {f.label && (
                            <div className="text-ui-fg-muted text-xs">
                              {f.label}
                              {f.reqd ? " · required" : ""}
                            </div>
                          )}
                        </td>
                        <td className="py-1 pr-2 align-top">
                          <span className="text-ui-fg-subtle">
                            {f.fieldtype}
                          </span>
                          {f.options &&
                            (f.fieldtype === "Link" ||
                              f.fieldtype === "Select") && (
                              <div className="text-ui-fg-muted text-xs">
                                → {String(f.options).split("\n")[0]}
                              </div>
                            )}
                        </td>
                      </tr>
                    ))}
                    {filteredFrappe.length === 0 && (
                      <tr>
                        <td colSpan={2} className="py-3 text-ui-fg-subtle">
                          No fields match.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!frappeFields && !frappeError && !frappeLoading && (
            <Text size="small" className="text-ui-fg-subtle mt-3">
              Pick a doctype above to see its fields.
            </Text>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Pull tab
// ─────────────────────────────────────────────────────────────────

const PullTab: React.FC = () => {
  const [doctype, setDoctype] = useState("Item")
  const [limit, setLimit] = useState(50)
  const [fields, setFields] = useState("")
  const [filters, setFilters] = useState("")
  const [running, setRunning] = useState(false)
  const [items, setItems] = useState<any[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setErr(null)
    setItems(null)
    try {
      const body: Record<string, unknown> = { doctype, limit }
      if (fields.trim()) {
        body.fields = fields
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      }
      if (filters.trim()) {
        try {
          body.filters = JSON.parse(filters)
        } catch {
          throw new Error("filters must be valid JSON")
        }
      }
      const res = await fetch("/admin/erpnext/pull/items", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        throw new Error(data.message || "pull_failed")
      }
      setItems(data.items ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : "pull_failed")
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="rounded border border-ui-border-base p-4">
      <Heading level="h2">Pull from ERPNext</Heading>
      <Text size="small" className="text-ui-fg-subtle mb-3">
        Read-only preview against{" "}
        <code className="font-mono">/api/resource/{`<doctype>`}</code>. Uses
        the API key/secret from settings. Response is shown raw — the write-
        back-to-Medusa step is intentionally separate (operator decides
        the field mapping).
      </Text>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <Label>Doctype</Label>
          <Input
            value={doctype}
            onChange={(e) => setDoctype(e.target.value)}
            placeholder="Item"
          />
        </div>
        <div>
          <Label>Limit</Label>
          <Input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 0)}
          />
        </div>
        <div>
          <Label>Fields (comma-separated, optional)</Label>
          <Input
            value={fields}
            onChange={(e) => setFields(e.target.value)}
            placeholder="name, item_code, item_name"
          />
        </div>
      </div>
      <div className="mt-3">
        <Label>Filters (Frappe JSON, optional)</Label>
        <Textarea
          rows={2}
          value={filters}
          onChange={(e) => setFilters(e.target.value)}
          placeholder='[["disabled","=",0]]'
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button onClick={run} disabled={running} variant="primary">
          {running ? "Pulling…" : "Pull"}
        </Button>
        {items && (
          <Text size="small" className="text-ui-fg-subtle">
            {items.length} row(s)
          </Text>
        )}
        {err && (
          <Text size="small" className="text-red-600">
            {err}
          </Text>
        )}
      </div>

      {items && items.length > 0 && (
        <pre className="mt-4 max-h-96 overflow-auto rounded bg-ui-bg-subtle p-3 text-xs">
          {JSON.stringify(items, null, 2)}
        </pre>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Events tab
// ─────────────────────────────────────────────────────────────────

const EventsTab: React.FC = () => {
  const [status, setStatus] = useState<"" | EventRow["status"]>("")
  const [rows, setRows] = useState<EventRow[] | null>(null)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const qs = new URLSearchParams()
      if (status) qs.set("status", status)
      qs.set("limit", "100")
      const res = await fetch(`/admin/erpnext/events?${qs}`, {
        credentials: "include",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "load_failed")
      setRows(data.items)
      setCount(data.count)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load_failed")
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    refresh()
  }, [refresh])

  const retry = async (eventId: string) => {
    setRetryingId(eventId)
    try {
      const res = await fetch(
        `/admin/erpnext/events/${encodeURIComponent(eventId)}/retry`,
        { method: "POST", credentials: "include" },
      )
      await res.json().catch(() => ({}))
    } finally {
      setRetryingId(null)
      refresh()
    }
  }

  return (
    <section className="rounded border border-ui-border-base p-4">
      <div className="mb-3 flex items-center justify-between">
        <Heading level="h2">Sync events</Heading>
        <div className="flex items-center gap-2">
          {(["", "pending", "success", "failed", "skipped"] as const).map(
            (s) => (
              <Button
                key={s || "all"}
                size="small"
                variant={status === s ? "primary" : "secondary"}
                onClick={() => setStatus(s)}
              >
                {s || "all"}
              </Button>
            ),
          )}
          <Button size="small" variant="secondary" onClick={refresh}>
            ↻
          </Button>
        </div>
      </div>

      {loading && <Text>Loading…</Text>}
      {err && (
        <Text size="small" className="text-red-600">
          {err}
        </Text>
      )}

      {rows && rows.length === 0 && (
        <Text className="text-ui-fg-subtle">No events.</Text>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ui-border-base text-ui-fg-subtle">
                <th className="py-2 text-left">Event</th>
                <th className="py-2 text-left">Status</th>
                <th className="py-2 text-left">Attempts</th>
                <th className="py-2 text-left">Last attempt</th>
                <th className="py-2 text-left">Last error</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ui-border-base">
                  <td className="py-2">
                    <code className="font-mono text-xs">{r.event}</code>
                    <div className="text-ui-fg-subtle text-xs">
                      {r.event_id}
                    </div>
                  </td>
                  <td className="py-2">
                    <StatusBadge color={statusColor(r.status)}>
                      {r.status}
                    </StatusBadge>
                  </td>
                  <td className="py-2">{r.attempts}</td>
                  <td className="py-2">
                    {r.last_attempt_at
                      ? new Date(r.last_attempt_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="py-2 max-w-xs truncate" title={r.last_error ?? ""}>
                    {r.last_error ?? "—"}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={retryingId === r.event_id}
                      onClick={() => retry(r.event_id)}
                    >
                      {retryingId === r.event_id ? "…" : "Retry"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Text size="small" className="text-ui-fg-subtle mt-2">
            Showing {rows.length} of {count}
          </Text>
        </div>
      )}
    </section>
  )
}

function statusColor(s: EventRow["status"]): "green" | "red" | "grey" | "orange" {
  switch (s) {
    case "success":
      return "green"
    case "failed":
      return "red"
    case "pending":
      return "orange"
    default:
      return "grey"
  }
}



// ─────────────────────────────────────────────────────────────────
// Mappings tab — generic operator-defined sync rules.
//
// Each mapping pairs one Medusa entity (driven by the static
// registry at modules/erpnext/registry.ts) with one Frappe doctype
// (introspected live via frappe.client.get_meta) and lists field-by-
// field pairs with optional per-field transforms + direction
// overrides. Storage is Medusa-side (`erpnext_mapping` table) —
// no dependency on a Frappe Single doctype for the field config.
//
// Two views inside the tab:
//   - list  → enable toggles, last-run state, delete
//   - edit  → entity/doctype/events/direction + field-pair builder
//             + Test (dry-run) + Pull-now buttons
// ─────────────────────────────────────────────────────────────────

type MedusaEntity = {
  key: string
  label: string
  module_name: string
  is_custom_module: boolean
  events: string[]
  default_key_path: string
  paths: Array<{
    path: string
    label: string
    type: string
    description?: string
    suggested_transform?: string
  }>
}

type DoctypeField = {
  fieldname: string
  label: string
  fieldtype: string
  reqd?: number
  options?: string | null
  in_list_view?: number
  hidden?: number
}

type FieldPair = {
  medusa_path: string
  erpnext_field: string
  direction?: "push" | "pull" | "both"
  transform?: string
  default?: unknown
  required?: boolean
}

type Mapping = {
  id: string
  name: string
  description: string | null
  enabled: boolean
  medusa_entity: string
  doctype: string
  direction: "push" | "pull" | "both"
  events: string[] | null
  pull_filter: any[] | null
  pull_page_size: number
  key_medusa_field: string
  key_erpnext_field: string
  field_mappings: FieldPair[]
  last_pull_at: string | null
  last_pull_run_at: string | null
  last_pull_error: string | null
  last_push_run_at: string | null
  last_push_error: string | null
  updated_at: string
}

const TRANSFORM_OPTIONS = [
  { value: "", label: "(no transform)" },
  { value: "lowercase", label: "lowercase" },
  { value: "uppercase", label: "uppercase" },
  { value: "trim", label: "trim whitespace" },
  { value: "number", label: "→ number" },
  { value: "integer", label: "→ integer" },
  { value: "boolean", label: "→ boolean" },
  { value: "json", label: "JSON stringify" },
  { value: "split:,", label: "split by comma → array" },
  { value: "join:,", label: "join array by comma → string" },
  { value: "date_iso", label: "→ ISO datetime" },
  { value: "date_yyyy_mm_dd", label: "→ YYYY-MM-DD" },
]

const MappingsTab: React.FC<{ onJumpToTab?: (t: Tab) => void }> = ({
  onJumpToTab,
}) => {
  const [view, setView] = useState<"list" | "edit">("list")
  const [editingId, setEditingId] = useState<string | null>(null)

  const openNew = () => {
    setEditingId(null)
    setView("edit")
  }
  const openEdit = (id: string) => {
    setEditingId(id)
    setView("edit")
  }
  const back = () => {
    setEditingId(null)
    setView("list")
  }

  return (
    <div>
      <Text className="mb-4 text-ui-fg-subtle">
        Operator-defined field mappings between Medusa entities and Frappe
        doctypes. Each mapping is one direction-aware sync rule with its own
        events, key fields, and per-field transforms.
      </Text>
      {view === "list" ? (
        <MappingList onOpen={openEdit} onNew={openNew} />
      ) : (
        <MappingEditor id={editingId} onBack={back} onJumpToTab={onJumpToTab} />
      )}
    </div>
  )
}
// ─── List view ────────────────────────────────────────────────────────

const MappingList: React.FC<{
  onOpen: (id: string) => void
  onNew: () => void
}> = ({ onOpen, onNew }) => {
  const [items, setItems] = useState<Mapping[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/admin/erpnext/mappings", {
        credentials: "include",
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message || "list_failed")
      setItems(body.items ?? [])
    } catch (e: any) {
      setError(e?.message ?? "failed")
    }
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])

  const toggleEnabled = async (m: Mapping) => {
    await fetch(`/admin/erpnext/mappings/${m.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...m, enabled: !m.enabled }),
    })
    refresh()
  }

  const remove = async (m: Mapping) => {
    if (!confirm(`Delete mapping "${m.name}"?`)) return
    await fetch(`/admin/erpnext/mappings/${m.id}`, {
      method: "DELETE",
      credentials: "include",
    })
    refresh()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Text weight="plus">{items?.length ?? 0} mappings</Text>
        <Button size="small" variant="primary" onClick={onNew}>
          <Plus /> New mapping
        </Button>
      </div>
      {error && <Text className="text-ui-fg-error mb-3">{error}</Text>}
      {!items && <Text>Loading…</Text>}
      {items && items.length === 0 && (
        <div className="rounded border p-6 text-center text-ui-fg-subtle">
          No mappings yet. Click <em>New mapping</em> above to build your first one.
        </div>
      )}
      {items && items.length > 0 && (
        <div className="rounded border">
          <table className="w-full text-sm">
            <thead className="bg-ui-bg-base-hover">
              <tr>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Medusa</th>
                <th className="p-2 text-left">Frappe doctype</th>
                <th className="p-2 text-left">Direction</th>
                <th className="p-2 text-left">Pairs</th>
                <th className="p-2 text-left">Last run</th>
                <th className="p-2 text-left">Enabled</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-2">
                    <a
                      onClick={() => onOpen(m.id)}
                      className="cursor-pointer font-medium text-ui-fg-interactive hover:underline"
                    >
                      {m.name}
                    </a>
                    {m.description && (
                      <div className="text-xs text-ui-fg-subtle">
                        {m.description}
                      </div>
                    )}
                  </td>
                  <td className="p-2">{m.medusa_entity}</td>
                  <td className="p-2">{m.doctype}</td>
                  <td className="p-2">{m.direction}</td>
                  <td className="p-2">{m.field_mappings?.length ?? 0}</td>
                  <td className="p-2 text-xs text-ui-fg-subtle">
                    {m.last_push_run_at && (
                      <div>push: {formatDate(m.last_push_run_at)}</div>
                    )}
                    {m.last_pull_run_at && (
                      <div>pull: {formatDate(m.last_pull_run_at)}</div>
                    )}
                    {m.last_push_error && (
                      <div className="text-ui-fg-error">{m.last_push_error}</div>
                    )}
                    {m.last_pull_error && (
                      <div className="text-ui-fg-error">{m.last_pull_error}</div>
                    )}
                  </td>
                  <td className="p-2">
                    <Switch
                      checked={m.enabled}
                      onCheckedChange={() => toggleEnabled(m)}
                    />
                  </td>
                  <td className="p-2 text-right">
                    <Button
                      size="small"
                      variant="transparent"
                      onClick={() => remove(m)}
                    >
                      <Trash />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Editor ───────────────────────────────────────────────────────────

const MappingEditor: React.FC<{
  id: string | null
  onBack: () => void
  onJumpToTab?: (t: Tab) => void
}> = ({ id, onBack, onJumpToTab }) => {
  const [entities, setEntities] = useState<MedusaEntity[]>([])
  const [doctypes, setDoctypes] = useState<string[]>([])
  const [doctypeSearch, setDoctypeSearch] = useState("")
  const [doctypeFields, setDoctypeFields] = useState<DoctypeField[]>([])
  const [draft, setDraft] = useState<Partial<Mapping>>({
    name: "",
    description: "",
    enabled: true,
    direction: "both",
    events: [],
    pull_filter: null,
    pull_page_size: 200,
    key_medusa_field: "",
    key_erpnext_field: "name",
    field_mappings: [],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testRecordId, setTestRecordId] = useState("")
  const [testResult, setTestResult] = useState<any>(null)

  // Load entities + (when editing) the mapping to be edited.
  useEffect(() => {
    fetch("/admin/erpnext/medusa-entities", { credentials: "include" })
      .then((r) => r.json())
      .then((b) => setEntities(b.items ?? []))
  }, [])

  useEffect(() => {
    if (!id) return
    fetch(`/admin/erpnext/mappings/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((b) => {
        if (b?.mapping) {
          setDraft(b.mapping)
          if (b.mapping.doctype) loadDoctypeFields(b.mapping.doctype)
        }
      })
  }, [id])

  // Load doctypes when entities have been resolved (so the form is usable).
  const [doctypesError, setDoctypesError] = useState<string | null>(null)
  const [doctypesLoading, setDoctypesLoading] = useState(false)
  useEffect(() => {
    refreshDoctypes("")
  }, [])

  const refreshDoctypes = async (search: string) => {
    setDoctypesLoading(true)
    setDoctypesError(null)
    try {
      const url = search
        ? `/admin/erpnext/doctypes?search=${encodeURIComponent(search)}&limit=200`
        : `/admin/erpnext/doctypes?limit=300`
      const res = await fetch(url, { credentials: "include" })
      const body = await res.json()
      if (!res.ok || body?.ok === false) {
        // Surface the underlying reason — the most common cause is
        // ERPNEXT_URL / api_key / api_secret not configured yet, in
        // which case the Settings tab is the next stop.
        setDoctypes([])
        setDoctypesError(
          body?.message ||
            `Frappe responded HTTP ${res.status} — check the Settings tab`,
        )
        return
      }
      const items = (body.items ?? []) as Array<{ name: string }>
      setDoctypes(items.map((i) => i.name))
      if (items.length === 0) {
        setDoctypesError(
          "Frappe returned zero doctypes — the api_key user may lack DocType read permission",
        )
      }
    } catch (e: any) {
      setDoctypes([])
      setDoctypesError(e?.message ?? "could not reach Frappe")
    } finally {
      setDoctypesLoading(false)
    }
  }

  const loadDoctypeFields = async (name: string) => {
    if (!name) {
      setDoctypeFields([])
      return
    }
    try {
      const res = await fetch(
        `/admin/erpnext/doctypes/${encodeURIComponent(name)}`,
        { credentials: "include" },
      )
      const body = await res.json()
      setDoctypeFields(body.fields ?? [])
    } catch (e: any) {
      setDoctypeFields([])
      setError(`could not load fields for ${name}: ${e?.message}`)
    }
  }

  const activeEntity = useMemo(
    () => entities.find((e) => e.key === draft.medusa_entity) ?? null,
    [entities, draft.medusa_entity],
  )

  const pickEntity = (key: string) => {
    const e = entities.find((x) => x.key === key)
    setDraft((d) => ({
      ...d,
      medusa_entity: key,
      events: e ? e.events : [],
      key_medusa_field: e ? e.default_key_path : "",
    }))
    if (draft.doctype) {
      maybeAutoSuggest(key, draft.doctype)
    }
  }

  const pickDoctype = (name: string) => {
    setDraft((d) => ({ ...d, doctype: name }))
    loadDoctypeFields(name)
    // Pull a canonical suggestion for the (entity, doctype) pair if
    // one exists in the registry. Operator can ignore/edit/remove the
    // pre-filled pairs.
    if (draft.medusa_entity) {
      maybeAutoSuggest(draft.medusa_entity, name)
    }
  }

  /**
   * Hit /admin/erpnext/mappings/suggest. If a canonical entry exists
   * AND the current draft has no field pairs yet (so we don't trample
   * operator edits), apply the suggestion. Status banner explains
   * what happened so the operator knows the form jumped on its own.
   */
  const [suggestStatus, setSuggestStatus] = useState<string | null>(null)
  const maybeAutoSuggest = async (entity: string, doctype: string) => {
    if ((draft.field_mappings?.length ?? 0) > 0) return
    try {
      const r = await fetch(
        `/admin/erpnext/mappings/suggest?entity=${encodeURIComponent(
          entity,
        )}&doctype=${encodeURIComponent(doctype)}`,
        { credentials: "include" },
      )
      const b = await r.json()
      if (b?.canonical && b?.suggestion) {
        const s = b.suggestion
        setDraft((d) => ({
          ...d,
          direction: s.direction ?? d.direction,
          events: s.events?.length ? s.events : d.events,
          pull_filter: s.pull_filter ?? d.pull_filter,
          key_medusa_field: s.key_medusa_field || d.key_medusa_field,
          key_erpnext_field: s.key_erpnext_field || d.key_erpnext_field,
          field_mappings: s.field_mappings ?? d.field_mappings,
        }))
        setSuggestStatus(
          `Auto-filled ${s.field_mappings?.length ?? 0} canonical field pair(s). Edit or remove any you don't want.`,
        )
      } else {
        setSuggestStatus(null)
      }
    } catch {
      /* swallow — UI just doesn't auto-fill */
    }
  }

  const setPair = (idx: number, patch: Partial<FieldPair>) => {
    setDraft((d) => {
      const fm = [...(d.field_mappings ?? [])]
      fm[idx] = { ...fm[idx], ...patch }
      return { ...d, field_mappings: fm }
    })
  }
  const addPair = () => {
    setDraft((d) => ({
      ...d,
      field_mappings: [
        ...(d.field_mappings ?? []),
        { medusa_path: "", erpnext_field: "" },
      ],
    }))
  }
  const removePair = (idx: number) => {
    setDraft((d) => {
      const fm = [...(d.field_mappings ?? [])]
      fm.splice(idx, 1)
      return { ...d, field_mappings: fm }
    })
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const url = id ? `/admin/erpnext/mappings/${id}` : "/admin/erpnext/mappings"
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message || "save_failed")
      onBack()
    } catch (e: any) {
      setError(e?.message ?? "save_failed")
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    if (!id) {
      setError("save first, then test")
      return
    }
    if (!testRecordId.trim()) {
      setError("enter a Medusa record id to test against")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        // Route folder is `dry-run` (NOT `test`) — Medusa's compiler
        // hardcodes `test` as an ignored directory name and silently
        // drops any file under it, leaving the endpoint to return 404
        // for every push. See dry-run/route.ts.
        `/admin/erpnext/mappings/${id}/dry-run`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ record_id: testRecordId.trim() }),
        },
      )
      const body = await res.json()
      setTestResult(body)
    } catch (e: any) {
      setError(e?.message ?? "test_failed")
    } finally {
      setBusy(false)
    }
  }

  const pullNow = async () => {
    if (!id) {
      setError("save first, then pull")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/admin/erpnext/mappings/${id}/pull-now`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      )
      const body = await res.json()
      setTestResult(body)
    } catch (e: any) {
      setError(e?.message ?? "pull_failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="secondary" size="small" onClick={onBack}>
          ← Back to list
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="small" onClick={test} disabled={busy || !id}>
            Test
          </Button>
          <Button variant="secondary" size="small" onClick={pullNow} disabled={busy || !id}>
            Pull now
          </Button>
          <Button variant="primary" size="small" onClick={save} disabled={busy}>
            {id ? "Save" : "Create"}
          </Button>
        </div>
      </div>

      {error && <Text className="text-ui-fg-error">{error}</Text>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Name</Label>
          <Input
            value={draft.name ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </div>
        <div>
          <Label>Direction</Label>
          <select
            className="w-full rounded border bg-ui-bg-base px-2 py-1.5 text-sm"
            value={draft.direction ?? "both"}
            onChange={(e) =>
              setDraft((d) => ({ ...d, direction: e.target.value as any }))
            }
          >
            <option value="both">both (push + pull)</option>
            <option value="push">push only (Medusa → Frappe)</option>
            <option value="pull">pull only (Frappe → Medusa)</option>
          </select>
        </div>
        <div className="col-span-2">
          <Label>Description</Label>
          <Textarea
            rows={2}
            value={draft.description ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, description: e.target.value }))
            }
          />
        </div>
        <div>
          <Label>Medusa entity</Label>
          <select
            className="w-full rounded border bg-ui-bg-base px-2 py-1.5 text-sm"
            value={draft.medusa_entity ?? ""}
            onChange={(e) => pickEntity(e.target.value)}
          >
            <option value="">— pick an entity —</option>
            {entities.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
                {e.is_custom_module ? `  (${e.module_name})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Frappe doctype</Label>
          <div className="flex gap-2">
            <Input
              placeholder={
                doctypesLoading
                  ? "loading…"
                  : doctypes.length
                    ? "search Frappe doctypes…"
                    : "—"
              }
              value={doctypeSearch}
              disabled={!doctypes.length && !doctypesLoading}
              onChange={(e) => {
                setDoctypeSearch(e.target.value)
                refreshDoctypes(e.target.value)
              }}
            />
          </div>
          <select
            className="mt-1 w-full rounded border bg-ui-bg-base px-2 py-1.5 text-sm disabled:opacity-50"
            value={draft.doctype ?? ""}
            disabled={!doctypes.length}
            onChange={(e) => pickDoctype(e.target.value)}
          >
            <option value="">
              {doctypesLoading
                ? "loading…"
                : doctypes.length
                  ? "— pick a doctype —"
                  : "— Frappe not connected —"}
            </option>
            {doctypes.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {/* Inline empty-state guidance. The most common reason the
              list is empty is ERPNEXT_URL / api_key / api_secret not
              configured yet — point the operator at the Settings tab. */}
          {!doctypesLoading && doctypes.length === 0 && (
            <Text className="mt-1 text-xs text-ui-fg-error">
              {doctypesError || "No doctypes available."}{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  // Switch the parent tab back to Settings so the
                  // operator can paste URL + api_key / api_secret +
                  // press "Test connection" without leaving the page.
                  onJumpToTab?.("settings")
                }}
                className="underline"
              >
                Open Settings tab →
              </a>
            </Text>
          )}
        </div>

        <div>
          <Label>Key field (Medusa path)</Label>
          <Input
            value={draft.key_medusa_field ?? ""}
            placeholder={activeEntity?.default_key_path ?? "email"}
            onChange={(e) =>
              setDraft((d) => ({ ...d, key_medusa_field: e.target.value }))
            }
          />
        </div>
        <div>
          <Label>Key field (Frappe doctype)</Label>
          <Input
            value={draft.key_erpnext_field ?? "name"}
            onChange={(e) =>
              setDraft((d) => ({ ...d, key_erpnext_field: e.target.value }))
            }
          />
        </div>

        <div className="col-span-2">
          <Label>Push events (comma separated)</Label>
          <Input
            value={(draft.events ?? []).join(", ")}
            placeholder={
              activeEntity ? activeEntity.events.join(", ") : "e.g. customer.created, customer.updated"
            }
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                events: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
            }
          />
          <Text className="mt-1 text-xs text-ui-fg-subtle">
            Subscriber fires this mapping whenever any listed event lands.
            Leave empty to disable the push side entirely.
          </Text>
        </div>

        <div className="col-span-2">
          <Label>Frappe-side pull filter (JSON)</Label>
          <Textarea
            rows={3}
            value={
              draft.pull_filter
                ? JSON.stringify(draft.pull_filter, null, 2)
                : ""
            }
            placeholder='[["disabled","=",0]]'
            onChange={(e) => {
              const v = e.target.value.trim()
              if (!v) {
                setDraft((d) => ({ ...d, pull_filter: null }))
                return
              }
              try {
                const parsed = JSON.parse(v)
                if (Array.isArray(parsed)) {
                  setDraft((d) => ({ ...d, pull_filter: parsed }))
                }
              } catch {
                /* still typing — don't clobber draft */
              }
            }}
          />
          <Text className="mt-1 text-xs text-ui-fg-subtle">
            Frappe filter syntax — array of [field, op, value] triples ANDed
            together with the time-based <code>modified &gt; last_pull_at</code>
            cursor at pull time.
          </Text>
        </div>
      </div>

      {/* Field-pair mapper */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <Heading level="h2">Field mappings</Heading>
          <div className="flex items-center gap-2">
            <Button
              size="small"
              variant="secondary"
              onClick={() => {
                if (!draft.medusa_entity || !draft.doctype) return
                // Force suggestion even when pairs exist (operator
                // pressed the button — assume they want the fresh
                // canonical set).
                setDraft((d) => ({ ...d, field_mappings: [] }))
                setTimeout(
                  () =>
                    maybeAutoSuggest(
                      draft.medusa_entity!,
                      draft.doctype!,
                    ),
                  0,
                )
              }}
              disabled={!draft.medusa_entity || !draft.doctype}
              title={
                !draft.medusa_entity || !draft.doctype
                  ? "Pick a Medusa entity and Frappe doctype first"
                  : "Pre-fill from the canonical mapping registry. Will replace existing pairs."
              }
            >
              Suggest field pairs
            </Button>
            <Button size="small" variant="secondary" onClick={addPair}>
              <Plus /> Add pair
            </Button>
          </div>
        </div>
        {suggestStatus && (
          <div className="mb-3 rounded border border-ui-border-interactive bg-ui-bg-subtle p-3 text-xs text-ui-fg-subtle">
            {suggestStatus}
          </div>
        )}
        <Text className="mb-4 text-xs text-ui-fg-subtle">
          Each row pairs one Medusa dot-path with one Frappe fieldname.
          Direction defaults to the mapping's overall direction; override
          per-pair to make a field one-way. The plugin ships canonical
          mappings for Customer↔Customer, Product↔Security, Order↔Security
          Sale, and Wallet Transaction↔Wallet Deposit/Withdrawal — pick
          the matching entity + doctype and the suggested pairs land
          automatically.
        </Text>
        {(draft.field_mappings ?? []).length === 0 && (
          <div className="rounded border p-4 text-center text-ui-fg-subtle">
            No field pairs yet — click <em>Suggest field pairs</em> for
            the canonical set, or <em>Add pair</em> to build manually.
          </div>
        )}
        {(draft.field_mappings ?? []).map((pair, idx) => (
          <FieldPairRow
            key={idx}
            pair={pair}
            entity={activeEntity}
            fields={doctypeFields}
            onChange={(patch) => setPair(idx, patch)}
            onRemove={() => removePair(idx)}
          />
        ))}
      </div>

      {/* Test / pull panel */}
      {id && (
        <div className="mt-6 rounded border p-4">
          <Heading level="h2" className="mb-2">
            Test
          </Heading>
          <div className="mb-2 flex gap-2">
            <Input
              placeholder="Medusa record id (cus_…, prod_…, etc.)"
              value={testRecordId}
              onChange={(e) => setTestRecordId(e.target.value)}
            />
            <Button variant="secondary" size="small" onClick={test} disabled={busy}>
              Dry-run push
            </Button>
          </div>
          {testResult && (
            <pre className="mt-2 max-h-96 overflow-auto rounded bg-ui-bg-subtle p-2 text-xs">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ─── One field-pair row ──────────────────────────────────────────────

const FieldPairRow: React.FC<{
  pair: FieldPair
  entity: MedusaEntity | null
  fields: DoctypeField[]
  onChange: (patch: Partial<FieldPair>) => void
  onRemove: () => void
}> = ({ pair, entity, fields, onChange, onRemove }) => {
  return (
    <div className="mb-2 grid grid-cols-12 gap-2 rounded border p-2 items-center">
      <div className="col-span-3">
        <select
          className="w-full rounded border bg-ui-bg-base px-2 py-1.5 text-sm"
          value={pair.medusa_path}
          onChange={(e) => onChange({ medusa_path: e.target.value })}
        >
          <option value="">— Medusa field —</option>
          {(entity?.paths ?? []).map((p) => (
            <option key={p.path} value={p.path}>
              {p.label} ({p.path})
            </option>
          ))}
        </select>
        <Input
          className="mt-1"
          placeholder="…or custom dot-path"
          value={pair.medusa_path}
          onChange={(e) => onChange({ medusa_path: e.target.value })}
        />
      </div>
      <div className="col-span-1 text-center text-ui-fg-subtle">↔</div>
      <div className="col-span-3">
        <select
          className="w-full rounded border bg-ui-bg-base px-2 py-1.5 text-sm"
          value={pair.erpnext_field}
          onChange={(e) => onChange({ erpnext_field: e.target.value })}
        >
          <option value="">— Frappe field —</option>
          {fields.map((f) => (
            <option key={f.fieldname} value={f.fieldname}>
              {f.label} ({f.fieldname}, {f.fieldtype})
              {f.reqd ? " *" : ""}
            </option>
          ))}
        </select>
        <Input
          className="mt-1"
          placeholder="…or custom fieldname"
          value={pair.erpnext_field}
          onChange={(e) => onChange({ erpnext_field: e.target.value })}
        />
      </div>
      <div className="col-span-2">
        <select
          className="w-full rounded border bg-ui-bg-base px-2 py-1.5 text-sm"
          value={pair.transform ?? ""}
          onChange={(e) => onChange({ transform: e.target.value || undefined })}
        >
          {TRANSFORM_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <select
          className="w-full rounded border bg-ui-bg-base px-2 py-1.5 text-sm"
          value={pair.direction ?? "both"}
          onChange={(e) =>
            onChange({ direction: e.target.value as any })
          }
        >
          <option value="both">both</option>
          <option value="push">push only</option>
          <option value="pull">pull only</option>
        </select>
      </div>
      <div className="col-span-1 text-right">
        <Button variant="transparent" size="small" onClick={onRemove}>
          <Trash />
        </Button>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return iso
  }
}

export const config = defineRouteConfig({
  label: "ERPNext",
  icon: ArrowsPointingOut,
})

export default ErpnextPage
