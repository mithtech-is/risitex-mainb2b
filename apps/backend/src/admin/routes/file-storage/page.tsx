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
} from "@medusajs/ui"
import { ArrowUpTray } from "@medusajs/icons"

/**
 * /app/file-storage — two independent storage routes, each editable:
 *
 *   • Public assets  → product images, logos (Medusa File Module).
 *                      Served from a public URL/CDN (e.g. R2 custom domain).
 *   • Private uploads → KYC docs + proofs (PAN, Aadhaar, CMR, bank/deposit).
 *                      Never on a public URL; defaults to the private local
 *                      volume, switchable to MinIO/S3.
 *
 * Both use the same provider-aware form; they just save under a different
 * scope. Changes take effect within ~10s, no redeploy.
 */

type Preset = "local" | "r2" | "aws" | "minio" | "wasabi" | "do" | "other"
type Scope = "public" | "private"

type View = {
  provider: "local" | "s3"
  provider_preset: string | null
  s3_bucket: string | null
  s3_endpoint: string | null
  s3_region: string
  s3_file_url: string | null
  s3_prefix: string | null
  s3_force_path_style: boolean
  s3_cache_control: string
  s3_access_key_id: string | null
  has_secret_access_key: boolean
}

const PRESETS: Record<
  Exclude<Preset, "local">,
  {
    label: string
    needs: string[]
    regionFixed?: string
    regionPlaceholder?: string
    pathStyleDefault: boolean
    blurb: string
  }
> = {
  r2: {
    label: "Cloudflare R2",
    needs: ["accountId", "bucket", "publicUrl", "keys", "prefix", "cacheControl"],
    regionFixed: "auto",
    pathStyleDefault: false,
    blurb:
      "Enter your Account ID — the S3 endpoint is built automatically. Connect a custom domain (R2 → bucket → Custom Domains) and put it in Public URL.",
  },
  aws: {
    label: "AWS S3",
    needs: ["region", "bucket", "publicUrl", "keys", "prefix", "cacheControl"],
    regionPlaceholder: "us-east-1",
    pathStyleDefault: false,
    blurb:
      "No endpoint needed — the SDK derives it from the region. Public URL is your bucket URL or a CloudFront domain.",
  },
  minio: {
    label: "MinIO (self-hosted)",
    needs: [
      "endpoint",
      "region",
      "bucket",
      "publicUrl",
      "keys",
      "prefix",
      "cacheControl",
      "pathStyleToggle",
    ],
    regionPlaceholder: "us-east-1",
    pathStyleDefault: true,
    blurb:
      "Point Endpoint at your MinIO server (e.g. https://minio.example.com). Path-style addressing is on by default.",
  },
  wasabi: {
    label: "Wasabi",
    needs: ["region", "bucket", "publicUrl", "keys", "prefix", "cacheControl"],
    regionPlaceholder: "us-east-1",
    pathStyleDefault: false,
    blurb: "The endpoint is built from the region (s3.<region>.wasabisys.com).",
  },
  do: {
    label: "DigitalOcean Spaces",
    needs: ["region", "bucket", "publicUrl", "keys", "prefix", "cacheControl"],
    regionPlaceholder: "nyc3",
    pathStyleDefault: false,
    blurb: "The endpoint is built from the region (<region>.digitaloceanspaces.com).",
  },
  other: {
    label: "Other S3-compatible",
    needs: [
      "endpoint",
      "region",
      "bucket",
      "publicUrl",
      "keys",
      "prefix",
      "cacheControl",
      "pathStyleToggle",
    ],
    regionPlaceholder: "auto",
    pathStyleDefault: false,
    blurb: "Full manual config for any other S3-compatible store.",
  },
}

function deriveEndpoint(
  preset: Preset,
  s: { accountId: string; region: string; endpoint: string },
): string {
  switch (preset) {
    case "r2":
      return s.accountId.trim()
        ? `https://${s.accountId.trim()}.r2.cloudflarestorage.com`
        : ""
    case "aws":
      return ""
    case "wasabi":
      return s.region.trim() ? `https://s3.${s.region.trim()}.wasabisys.com` : ""
    case "do":
      return s.region.trim()
        ? `https://${s.region.trim()}.digitaloceanspaces.com`
        : ""
    case "minio":
    case "other":
      return s.endpoint.trim()
    default:
      return ""
  }
}

function inferFromEndpoint(endpoint: string | null): {
  preset: Exclude<Preset, "local">
  accountId: string
  region: string
} {
  const ep = (endpoint || "").toLowerCase()
  if (ep.includes(".r2.cloudflarestorage.com")) {
    const host = ep.replace(/^https?:\/\//, "")
    return { preset: "r2", accountId: host.split(".")[0] || "", region: "auto" }
  }
  if (ep.includes(".wasabisys.com")) {
    const m = ep.match(/s3\.([^.]+)\.wasabisys\.com/)
    return { preset: "wasabi", accountId: "", region: m?.[1] || "" }
  }
  if (ep.includes(".digitaloceanspaces.com")) {
    const m = ep.match(/https?:\/\/([^.]+)\.digitaloceanspaces\.com/)
    return { preset: "do", accountId: "", region: m?.[1] || "" }
  }
  if (!ep) return { preset: "aws", accountId: "", region: "" }
  return { preset: "other", accountId: "", region: "" }
}

/** One editable storage route (public OR private). */
function ScopeCard({
  scope,
  heading,
  routesHere,
  privateMode,
}: {
  scope: Scope
  heading: string
  routesHere: string
  privateMode: boolean
}) {
  const [preset, setPreset] = useState<Preset>("local")
  const [accountId, setAccountId] = useState("")
  const [bucket, setBucket] = useState("")
  const [endpoint, setEndpoint] = useState("")
  const [region, setRegion] = useState("auto")
  const [fileUrl, setFileUrl] = useState("")
  const [prefix, setPrefix] = useState("")
  const [forcePathStyle, setForcePathStyle] = useState(false)
  const [cacheControl, setCacheControl] = useState(
    privateMode ? "private, max-age=0, no-store" : "public, max-age=31536000, immutable",
  )
  const [accessKeyId, setAccessKeyId] = useState("")
  const [secret, setSecret] = useState("")
  const [hasSecret, setHasSecret] = useState(false)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [buckets, setBuckets] = useState<{ name: string }[] | null>(null)
  const [bucketsErr, setBucketsErr] = useState<string | null>(null)
  const [bucketsLoading, setBucketsLoading] = useState(false)
  const [newBucket, setNewBucket] = useState("")
  const [bucketBusy, setBucketBusy] = useState(false)
  const [bucketMsg, setBucketMsg] = useState<{ ok: boolean; msg: string } | null>(null)
  // "select" → pick the active bucket from the listed dropdown.
  // "custom" → type a name (for a bucket the list can't show / new).
  const [bucketMode, setBucketMode] = useState<"select" | "custom">("select")

  const cfg = preset === "local" ? null : PRESETS[preset]
  const needs = (f: string) => !!cfg?.needs.includes(f)

  const hydrate = (v: View) => {
    if (v.provider === "local") {
      setPreset("local")
    } else {
      const inferred = inferFromEndpoint(v.s3_endpoint)
      const p = (v.provider_preset as Preset) || inferred.preset
      setPreset(p)
      setAccountId(p === "r2" ? inferred.accountId : "")
    }
    setBucket(v.s3_bucket ?? "")
    setEndpoint(v.s3_endpoint ?? "")
    setRegion(v.s3_region ?? "auto")
    setFileUrl(v.s3_file_url ?? "")
    setPrefix(v.s3_prefix ?? "")
    setForcePathStyle(!!v.s3_force_path_style)
    setCacheControl(
      v.s3_cache_control ??
        (privateMode ? "private, max-age=0, no-store" : "public, max-age=31536000, immutable"),
    )
    setAccessKeyId(v.s3_access_key_id ?? "")
    setHasSecret(!!v.has_secret_access_key)
    setSecret("")
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/admin/file-storage?scope=${scope}`, { credentials: "include" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message || "load_failed")
      if (body.file_storage) hydrate(body.file_storage)
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed")
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  useEffect(() => {
    void load()
  }, [load])

  const onPresetChange = (next: Preset) => {
    setPreset(next)
    setTestResult(null)
    if (next === "local") return
    const meta = PRESETS[next]
    setForcePathStyle(meta.pathStyleDefault)
    if (meta.regionFixed) setRegion(meta.regionFixed)
    else if (!region || region === "auto") setRegion(meta.regionPlaceholder || "")
  }

  const resolvedEndpoint = useMemo(
    () => deriveEndpoint(preset, { accountId, region, endpoint }),
    [preset, accountId, region, endpoint],
  )

  const s3Body = () => ({
    scope,
    s3_bucket: bucket.trim() || null,
    s3_endpoint: resolvedEndpoint || null,
    s3_region: (cfg?.regionFixed || region).trim() || "auto",
    s3_force_path_style: forcePathStyle,
    s3_access_key_id: accessKeyId.trim() || null,
    ...(secret ? { secret_access_key: secret } : {}),
  })

  const save = async () => {
    setSaving(true)
    setError(null)
    setFlash(null)
    try {
      const payload: Record<string, unknown> = {
        scope,
        provider: preset === "local" ? "local" : "s3",
        provider_preset: preset === "local" ? null : preset,
        s3_file_url: fileUrl.trim() || null,
        s3_prefix: prefix.trim() || null,
        s3_cache_control: cacheControl.trim() || undefined,
        ...(preset === "local" ? {} : s3Body()),
      }
      const res = await fetch("/admin/file-storage", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message || "save_failed")
      if (body.file_storage) hydrate(body.file_storage)
      setFlash("Saved")
      setTimeout(() => setFlash(null), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed")
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const res = await fetch("/admin/file-storage/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s3Body()),
      })
      const body = await res.json()
      setTestResult({ ok: !!body.ok, msg: body.message || (body.ok ? "OK" : "Failed") })
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "failed" })
    } finally {
      setTesting(false)
    }
  }

  const canTest =
    preset !== "local" &&
    !!bucket &&
    !!accessKeyId &&
    (hasSecret || !!secret) &&
    (preset === "aws" || !!resolvedEndpoint)

  const loadBuckets = useCallback(async () => {
    setBucketsLoading(true)
    setBucketsErr(null)
    try {
      const res = await fetch(`/admin/file-storage/buckets?scope=${scope}`, { credentials: "include" })
      const body = await res.json()
      if (body.buckets === null || body.error) {
        setBuckets(null)
        setBucketsErr(body.error || "Could not list buckets.")
      } else {
        setBuckets(body.buckets || [])
      }
    } catch (e) {
      setBucketsErr(e instanceof Error ? e.message : "failed")
    } finally {
      setBucketsLoading(false)
    }
  }, [scope])

  // Auto-load the bucket list once a saved S3 config exists, so the
  // Bucket field can be a dropdown instead of free text.
  useEffect(() => {
    if (preset !== "local" && hasSecret && buckets === null && !bucketsLoading) {
      void loadBuckets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, hasSecret])

  const createBucket = async () => {
    if (!newBucket.trim()) return
    setBucketBusy(true)
    setBucketMsg(null)
    try {
      const res = await fetch("/admin/file-storage/buckets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBucket.trim(), scope }),
      })
      const body = await res.json()
      setBucketMsg({ ok: !!body.ok, msg: body.message || (body.ok ? "Created" : "Failed") })
      if (body.ok) {
        setNewBucket("")
        await loadBuckets()
      }
    } catch (e) {
      setBucketMsg({ ok: false, msg: e instanceof Error ? e.message : "failed" })
    } finally {
      setBucketBusy(false)
    }
  }

  const deleteBucket = async (name: string) => {
    const typed = window.prompt(
      `Delete bucket "${name}"? This cannot be undone, and only works if the bucket is empty.\n\nType the bucket name to confirm:`,
    )
    if (typed !== name) return
    setBucketBusy(true)
    setBucketMsg(null)
    try {
      const res = await fetch(
        `/admin/file-storage/buckets/${encodeURIComponent(name)}?scope=${scope}`,
        { method: "DELETE", credentials: "include" },
      )
      const body = await res.json()
      setBucketMsg({ ok: !!body.ok, msg: body.message || (body.ok ? "Deleted" : "Failed") })
      if (body.ok) await loadBuckets()
    } catch (e) {
      setBucketMsg({ ok: false, msg: e instanceof Error ? e.message : "failed" })
    } finally {
      setBucketBusy(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{heading}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {routesHere}
        </Text>
      </div>

      {error && (
        <div className="px-6 py-3">
          <StatusBadge color="red">{error}</StatusBadge>
        </div>
      )}

      <div className="flex flex-col gap-y-5 px-6 py-5">
        <div className="flex max-w-sm flex-col gap-y-1">
          <Label size="small" weight="plus">
            Storage backend
          </Label>
          <Select value={preset} onValueChange={(v) => onPresetChange(v as Preset)}>
            <Select.Trigger>
              <Select.Value placeholder="Select backend" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="local">Local disk (private volume)</Select.Item>
              <Select.Item value="minio">MinIO (self-hosted)</Select.Item>
              <Select.Item value="r2">Cloudflare R2</Select.Item>
              <Select.Item value="aws">AWS S3</Select.Item>
              <Select.Item value="wasabi">Wasabi</Select.Item>
              <Select.Item value="do">DigitalOcean Spaces</Select.Item>
              <Select.Item value="other">Other S3-compatible</Select.Item>
            </Select.Content>
          </Select>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {preset === "local"
              ? privateMode
                ? "Files stay on the server's private volume — never exposed on a public URL."
                : "Files stay on the server. Pick a cloud provider to offload to object storage + CDN."
              : cfg?.blurb}
          </Text>
        </div>

        {preset !== "local" && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {needs("accountId") && (
                <div className="flex flex-col gap-y-1 md:col-span-2">
                  <Label size="small" weight="plus">Cloudflare Account ID</Label>
                  <Input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="from R2 → Manage API Tokens" />
                  {resolvedEndpoint && (
                    <Text size="xsmall" className="text-ui-fg-subtle">Endpoint: {resolvedEndpoint}</Text>
                  )}
                </div>
              )}
              {needs("endpoint") && (
                <div className="flex flex-col gap-y-1 md:col-span-2">
                  <Label size="small" weight="plus">Endpoint</Label>
                  <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={preset === "minio" ? "https://minio.example.com" : "https://s3.example.com"} />
                </div>
              )}
              <div className="flex flex-col gap-y-1">
                <div className="flex items-center justify-between">
                  <Label size="small" weight="plus">Bucket</Label>
                  {bucketsLoading && (
                    <Text size="xsmall" className="text-ui-fg-subtle">loading buckets…</Text>
                  )}
                </div>
                {buckets && buckets.length > 0 && bucketMode === "select" ? (
                  <>
                    <Select
                      value={buckets.some((b) => b.name === bucket) ? bucket : ""}
                      onValueChange={(v) => {
                        if (v === "__custom__") setBucketMode("custom")
                        else setBucket(v)
                      }}
                    >
                      <Select.Trigger>
                        <Select.Value placeholder="Select a bucket" />
                      </Select.Trigger>
                      <Select.Content>
                        {buckets.map((b) => (
                          <Select.Item key={b.name} value={b.name}>{b.name}</Select.Item>
                        ))}
                        <Select.Item value="__custom__">＋ Enter a name manually…</Select.Item>
                      </Select.Content>
                    </Select>
                    <button
                      type="button"
                      onClick={loadBuckets}
                      className="self-start text-ui-fg-muted hover:text-ui-fg-base txt-compact-xsmall"
                    >
                      ↻ Refresh list
                    </button>
                  </>
                ) : (
                  <>
                    <Input
                      value={bucket}
                      onChange={(e) => setBucket(e.target.value)}
                      placeholder={privateMode ? "risitex-private" : "risitex-public"}
                    />
                    {buckets && buckets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setBucketMode("select")}
                        className="self-start text-ui-fg-muted hover:text-ui-fg-base txt-compact-xsmall"
                      >
                        ▾ Choose from list
                      </button>
                    )}
                  </>
                )}
              </div>
              {needs("region") && (
                <div className="flex flex-col gap-y-1">
                  <Label size="small" weight="plus">Region</Label>
                  <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder={cfg?.regionPlaceholder} />
                  {(preset === "wasabi" || preset === "do") && resolvedEndpoint && (
                    <Text size="xsmall" className="text-ui-fg-subtle">Endpoint: {resolvedEndpoint}</Text>
                  )}
                </div>
              )}
              {!privateMode && (
                <div className="flex flex-col gap-y-1 md:col-span-2">
                  <Label size="small" weight="plus">Public URL</Label>
                  <Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder={preset === "r2" ? "https://cdn.risitex.com" : "https://<your-public-or-cdn-url>"} />
                  <Text size="xsmall" className="text-ui-fg-subtle">Base URL public files are served from (custom domain / bucket public URL).</Text>
                </div>
              )}
              <div className="flex flex-col gap-y-1">
                <Label size="small" weight="plus">Access Key ID</Label>
                <Input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} placeholder={preset === "aws" ? "AKIA…" : "access key id"} />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="small" weight="plus">Secret Access Key</Label>
                <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={hasSecret ? "•••••••• (stored — leave blank to keep)" : "Enter secret"} />
                <Text size="xsmall" className="text-ui-fg-subtle">Encrypted at rest. Leave blank to keep the saved one.</Text>
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="small" weight="plus">Key prefix (optional)</Label>
                <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder={privateMode ? "kyc/" : "public/"} />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="small" weight="plus">Cache-Control</Label>
                <Input value={cacheControl} onChange={(e) => setCacheControl(e.target.value)} />
              </div>
            </div>
            {needs("pathStyleToggle") && (
              <div className="flex flex-col gap-y-1">
                <Label size="small" weight="plus">Force path-style addressing</Label>
                <div className="flex items-center gap-2">
                  <Switch checked={forcePathStyle} onCheckedChange={setForcePathStyle} />
                  <Text size="small" className="text-ui-fg-subtle">On for MinIO / some self-hosted S3. Off for hosted clouds.</Text>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={save} isLoading={saving} disabled={saving || loading}>Save</Button>
          {preset !== "local" && (
            <Button variant="secondary" onClick={test} isLoading={testing} disabled={testing || loading || !canTest}>
              Test connection
            </Button>
          )}
          {flash && <StatusBadge color="green">{flash}</StatusBadge>}
          {testResult && (
            <StatusBadge color={testResult.ok ? "green" : "red"}>
              {testResult.ok ? "✓ " : "✗ "}{testResult.msg}
            </StatusBadge>
          )}
        </div>

        {preset !== "local" && (
          <div className="flex flex-col gap-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label size="small" weight="plus">Buckets</Label>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Create or delete buckets on this backend. Needs an <strong>Admin Read &amp; Write</strong> token. Delete only works on empty buckets.
                </Text>
              </div>
              <Button variant="secondary" size="small" onClick={loadBuckets} isLoading={bucketsLoading}>
                {buckets === null && !bucketsErr ? "Load buckets" : "Refresh"}
              </Button>
            </div>
            {bucketsErr && <StatusBadge color="red">{bucketsErr}</StatusBadge>}
            {buckets && buckets.length > 0 && (
              <div className="flex flex-col divide-y rounded-md border">
                {buckets.map((b) => (
                  <div key={b.name} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Text size="small" className="font-mono">{b.name}</Text>
                      {b.name === bucket && <StatusBadge color="green">active</StatusBadge>}
                    </div>
                    <div className="flex items-center gap-2">
                      {b.name !== bucket && (
                        <Button variant="transparent" size="small" onClick={() => setBucket(b.name)}>Use</Button>
                      )}
                      <Button variant="danger" size="small" onClick={() => deleteBucket(b.name)} disabled={bucketBusy}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {buckets && buckets.length === 0 && (
              <Text size="small" className="text-ui-fg-subtle">No buckets yet.</Text>
            )}
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-y-1">
                <Label size="xsmall" className="text-ui-fg-subtle">New bucket name</Label>
                <Input value={newBucket} onChange={(e) => setNewBucket(e.target.value.toLowerCase())} placeholder="my-new-bucket" />
              </div>
              <Button variant="secondary" onClick={createBucket} isLoading={bucketBusy} disabled={bucketBusy || !newBucket.trim()}>
                Create bucket
              </Button>
              {bucketMsg && (
                <StatusBadge color={bucketMsg.ok ? "green" : "red"}>
                  {bucketMsg.ok ? "✓ " : "✗ "}{bucketMsg.msg}
                </StatusBadge>
              )}
            </div>
          </div>
        )}
      </div>
    </Container>
  )
}

const FileStoragePage = () => {
  return (
    <div className="flex flex-col gap-y-4">
      <ScopeCard
        scope="public"
        privateMode={false}
        heading="Public assets"
        routesHere="Product images, company logos — everything the storefront renders. Served from a public URL/CDN. Edit the backend below; changes apply within ~10s, no redeploy."
      />
      <ScopeCard
        scope="private"
        privateMode={true}
        heading="Private uploads"
        routesHere="KYC documents & proofs (PAN, Aadhaar, CMR, bank/deposit). Never exposed on a public URL — kept private. Defaults to the server's local volume; point it at MinIO/S3 when ready."
      />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "File storage",
  icon: ArrowUpTray,
})

export default FileStoragePage
