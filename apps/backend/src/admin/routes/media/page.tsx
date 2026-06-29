import React, { useCallback, useEffect, useMemo, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Select,
  StatusBadge,
  Text,
} from "@medusajs/ui"
import { Photo } from "@medusajs/icons"

/**
 * /app/media — Media Explorer.
 *
 * Lists every image in the PUBLIC bucket (R2) and lets you run sharp-based
 * transforms (optimize / crop / trim / rotate / light·dark variants) and
 * self-hosted background removal, then apply the result as a product
 * thumbnail. Each transform writes a NEW object — originals are untouched.
 */

type MediaImage = {
  key: string
  url: string
  size: number
  last_modified: string | null
  used_by: { id: string; title: string }[]
}

const fmtBytes = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`

const MediaPage = () => {
  const [images, setImages] = useState<MediaImage[] | null>(null)
  const [libErr, setLibErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<MediaImage | null>(null)

  const loadLibrary = useCallback(async () => {
    setLoading(true)
    setLibErr(null)
    try {
      const res = await fetch("/admin/media/library", { credentials: "include" })
      const body = await res.json()
      if (body.images === null || body.error) {
        setImages(null)
        setLibErr(body.error || "Could not list media.")
      } else {
        setImages(body.images || [])
      }
    } catch (e) {
      setLibErr(e instanceof Error ? e.message : "failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  const filtered = useMemo(() => {
    if (!images) return []
    const q = search.trim().toLowerCase()
    if (!q) return images
    return images.filter(
      (im) =>
        im.key.toLowerCase().includes(q) ||
        im.used_by.some((u) => u.title.toLowerCase().includes(q)),
    )
  }, [images, search])

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Media library</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Every image in your public bucket. Click one to optimize, crop, trim,
            make light/dark variants, remove the background, or set it as a
            product thumbnail. Transforms always save a new copy.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search filename or product…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Button variant="secondary" onClick={loadLibrary} isLoading={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {libErr && (
        <div className="px-6 py-3">
          <StatusBadge color="red">{libErr}</StatusBadge>
          <Text size="xsmall" className="text-ui-fg-subtle mt-1">
            Listing needs public storage on S3/R2 with an Admin Read &amp; Write token.
          </Text>
        </div>
      )}

      <div className="px-6 py-5">
        {images && (
          <Text size="small" className="text-ui-fg-subtle mb-3">
            {filtered.length} of {images.length} images
          </Text>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filtered.map((im) => (
            <button
              key={im.key}
              type="button"
              onClick={() => setSelected(im)}
              className="border-ui-border-base hover:border-ui-border-interactive group flex flex-col overflow-hidden rounded-lg border text-left"
            >
              <div className="bg-ui-bg-subtle flex h-28 items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt={im.key} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex flex-col gap-y-0.5 px-2 py-1.5">
                <Text size="xsmall" className="truncate font-medium" title={im.key}>
                  {im.key.split("/").pop()}
                </Text>
                <div className="flex items-center justify-between">
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {fmtBytes(im.size)}
                  </Text>
                  {im.used_by.length > 0 ? (
                    <StatusBadge color="green">in use</StatusBadge>
                  ) : (
                    <StatusBadge color="grey">unused</StatusBadge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
        {images && filtered.length === 0 && (
          <Text size="small" className="text-ui-fg-subtle">
            No images.
          </Text>
        )}
      </div>

      <Editor
        image={selected}
        onClose={() => setSelected(null)}
        onChanged={loadLibrary}
        onEditResult={(url, key) => setSelected({ key, url, size: 0, last_modified: null, used_by: [] })}
      />
    </Container>
  )
}

function Editor({
  image,
  onClose,
  onChanged,
  onEditResult,
}: {
  image: MediaImage | null
  onClose: () => void
  onChanged: () => void
  onEditResult: (url: string, key: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // optimize params
  const [optFormat, setOptFormat] = useState<"webp" | "avif" | "jpeg" | "png">("webp")
  const [maxW, setMaxW] = useState("512")
  const [maxH, setMaxH] = useState("")
  const [quality, setQuality] = useState("82")
  // apply-to-product
  const [pq, setPq] = useState("")
  const [prods, setProds] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    setResult(null)
    setMsg(null)
  }, [image?.url])

  useEffect(() => {
    if (!pq.trim()) {
      setProds([])
      return
    }
    let alive = true
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/admin/products?q=${encodeURIComponent(pq)}&limit=8&fields=id,title`,
          { credentials: "include" },
        )
        const body = await res.json()
        if (alive) setProds(body.products || [])
      } catch {
        /* ignore */
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [pq])

  const source = result || image?.url

  const run = async (label: string, endpoint: string, payload: any) => {
    if (!source) return
    setBusy(label)
    setMsg(null)
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: source, ...payload }),
      })
      const body = await res.json()
      if (body.ok) {
        setResult(body.url)
        setMsg({ ok: true, text: `Saved (${fmtBytes(body.bytes || 0)})` })
        onChanged()
      } else {
        setMsg({ ok: false, text: body.message || "failed" })
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "failed" })
    } finally {
      setBusy(null)
    }
  }

  const transform = (label: string, ops: any[]) =>
    run(label, "/admin/media/transform", { ops })

  const apply = async (productId: string) => {
    if (!source) return
    setBusy("apply")
    setMsg(null)
    try {
      const res = await fetch("/admin/media/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, url: source, also_image: true }),
      })
      const body = await res.json()
      setMsg({ ok: !!body.ok, text: body.message || (body.ok ? "Applied" : "failed") })
      if (body.ok) onChanged()
    } finally {
      setBusy(null)
    }
  }

  const deleteImage = async () => {
    if (!image) return
    const used = image.used_by.length
    const typed = window.prompt(
      `Delete "${image.key.split("/").pop()}" from the bucket? This is permanent and can't be undone${
        used ? ` — and it's used by ${used} product(s), whose thumbnail will break.` : "."
      }\n\nType DELETE to confirm:`,
    )
    if (typed !== "DELETE") return
    setBusy("del")
    setMsg(null)
    try {
      const res = await fetch("/admin/media/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: image.key }),
      })
      const body = await res.json()
      if (body.ok) {
        onChanged()
        onClose()
      } else {
        setMsg({ ok: false, text: body.message || "delete failed" })
      }
    } finally {
      setBusy(null)
    }
  }

  const Op = ({ id, label, ops }: { id: string; label: string; ops: any[] }) => (
    <Button variant="secondary" size="small" isLoading={busy === id} onClick={() => transform(id, ops)}>
      {label}
    </Button>
  )

  // Output format applied to EVERY operation (so crops/variants honour it too).
  const fmt = [{ type: "format", format: optFormat, quality: Number(quality) || 82 }]

  const optimizeOps = () => {
    const ops: any[] = []
    const w = Number(maxW) || 0
    const h = Number(maxH) || 0
    if (w || h) ops.push({ type: "resize", width: w || undefined, height: h || undefined })
    ops.push(...fmt)
    return ops
  }

  return (
    <Drawer open={!!image} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Edit image</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          {source && (
            <div className="bg-ui-bg-subtle flex items-center justify-center rounded-lg p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source} alt="preview" className="max-h-56 max-w-full object-contain" />
            </div>
          )}
          {result && (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge color="blue">new copy</StatusBadge>
              <Text size="xsmall" className="truncate font-mono" title={result}>
                {result.split("/").pop()}
              </Text>
              <Button variant="transparent" size="small" onClick={() => onEditResult(result, result.split("/").pop() || "")}>
                Edit this result
              </Button>
            </div>
          )}

          {/* Associate with a product — first thing, so you can assign
              directly without scrolling through the edit tools. */}
          <div className="flex flex-col gap-y-2 rounded-lg border p-3">
            <Label size="small" weight="plus">Associate with a product</Label>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Sets {result ? "the new copy" : "this image"} as the product&apos;s thumbnail + first image.
            </Text>
            <Input placeholder="Search product by name…" value={pq} onChange={(e) => setPq(e.target.value)} />
            {prods.length > 0 && (
              <div className="flex flex-col divide-y rounded-md border">
                {prods.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-1.5">
                    <Text size="small" className="truncate">{p.title}</Text>
                    <Button variant="secondary" size="small" isLoading={busy === "apply"} onClick={() => apply(p.id)}>
                      Associate
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {pq.trim() && prods.length === 0 && (
              <Text size="xsmall" className="text-ui-fg-muted">No matching products.</Text>
            )}
          </div>

          <div className="flex flex-col gap-y-2 border-t pt-3">
            <Label size="small" weight="plus">Optimize</Label>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Format + quality + max size apply to every operation below too.
            </Text>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="flex flex-col gap-y-1">
                <Label size="xsmall" className="text-ui-fg-subtle">Format</Label>
                <Select value={optFormat} onValueChange={(v) => setOptFormat(v as any)}>
                  <Select.Trigger><Select.Value /></Select.Trigger>
                  <Select.Content>
                    <Select.Item value="webp">WebP (best balance)</Select.Item>
                    <Select.Item value="avif">AVIF (smallest)</Select.Item>
                    <Select.Item value="jpeg">JPEG (mozjpeg)</Select.Item>
                    <Select.Item value="png">PNG (lossless)</Select.Item>
                  </Select.Content>
                </Select>
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="xsmall" className="text-ui-fg-subtle">
                  Quality{optFormat === "png" ? " (n/a)" : ""}
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={quality}
                  disabled={optFormat === "png"}
                  onChange={(e) => setQuality(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="xsmall" className="text-ui-fg-subtle">Max width</Label>
                <Input type="number" placeholder="auto" value={maxW} onChange={(e) => setMaxW(e.target.value)} />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="xsmall" className="text-ui-fg-subtle">Max height</Label>
                <Input type="number" placeholder="auto" value={maxH} onChange={(e) => setMaxH(e.target.value)} />
              </div>
            </div>
            <Button
              variant="secondary"
              size="small"
              className="self-start"
              isLoading={busy === "opt"}
              onClick={() => transform("opt", optimizeOps())}
            >
              Optimize → {optFormat.toUpperCase()}
            </Button>
          </div>

          <div className="flex flex-col gap-y-2 border-t pt-3">
            <Label size="small" weight="plus">Crop &amp; clean</Label>
            <div className="flex flex-wrap gap-2">
              <Op id="trim" label="Trim borders" ops={[{ type: "trim" }, ...fmt]} />
              <Op id="sq" label="Crop 1:1" ops={[{ type: "resize", width: 512, height: 512, fit: "cover" }, ...fmt]} />
              <Op id="43" label="Crop 4:3" ops={[{ type: "resize", width: 600, height: 450, fit: "cover" }, ...fmt]} />
              <Op id="169" label="Crop 16:9" ops={[{ type: "resize", width: 640, height: 360, fit: "cover" }, ...fmt]} />
              <Op id="rot" label="Rotate 90°" ops={[{ type: "rotate", angle: 90 }, ...fmt]} />
              <Op id="flop" label="Mirror" ops={[{ type: "flop" }, ...fmt]} />
            </div>
          </div>

          <div className="flex flex-col gap-y-2 border-t pt-3">
            <Label size="small" weight="plus">Background</Label>
            <div className="flex flex-wrap gap-2">
              <Op
                id="keyout"
                label="Remove white background"
                ops={[
                  { type: "keyout", tolerance: 48 },
                  { type: "trim" },
                  { type: "format", format: "webp", quality: 90 },
                ]}
              />
              <Button
                variant="secondary"
                size="small"
                isLoading={busy === "nobg"}
                onClick={() => run("nobg", "/admin/media/remove-bg", { trim: true })}
              >
                AI remove (photos)
              </Button>
            </div>
            <Text size="xsmall" className="text-ui-fg-subtle">
              <strong>Remove white background</strong> keys out a white/light backdrop —
              best for logos. <strong>AI remove</strong> is for photographic backgrounds
              (slower, can struggle with flat logos).
            </Text>
          </div>

          <div className="flex flex-col gap-y-2 border-t pt-3">
            <Label size="small" weight="plus">Delete</Label>
            {image && image.used_by.length > 0 && (
              <Text size="xsmall" className="text-ui-fg-error">
                ⚠ In use by {image.used_by.length} product
                {image.used_by.length === 1 ? "" : "s"} — deleting breaks their thumbnail.
              </Text>
            )}
            <Button
              variant="danger"
              size="small"
              className="self-start"
              isLoading={busy === "del"}
              onClick={deleteImage}
            >
              Delete image
            </Button>
          </div>

          {msg && (
            <StatusBadge color={msg.ok ? "green" : "red"}>
              {msg.ok ? "✓ " : "✗ "}{msg.text}
            </StatusBadge>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}

export const config = defineRouteConfig({
  label: "Media",
  icon: Photo,
})

export default MediaPage
