import React, { useMemo, useState } from "react"
import { Button, Input, Label, Text, Textarea, toast } from "@medusajs/ui"

/**
 * Schema/JSON-LD generator (OVO Phase 8.C).
 *
 * A small admin tool that lets an editor pick a schema.org type from
 * a dropdown, fill in just the required fields, and append the
 * generated JSON-LD block to the parent `OvoOverrideForm`'s
 * `custom_json_ld` textarea. The hand-written JSON-LD pathway still
 * works untouched — this is purely additive, a "scaffold for the
 * 90% case" so admins don't have to memorise schema.org shapes.
 *
 * The output is always a single-block array (the parent form already
 * accepts arrays + single objects) wrapped in `@context` +  `@type`.
 *
 * Templates here intentionally cover the high-value rich-result
 * formats Google still surfaces in 2026 SERPs (and Bing/Yandex /
 * DDG render the markup too). For exotic types, admins still drop
 * into the raw textarea.
 */

type SchemaTypeKey =
  | "FAQPage"
  | "BreadcrumbList"
  | "Article"
  | "HowTo"
  | "Review"
  | "VideoObject"
  | "Event"
  | "Organization"

const SCHEMA_TYPES: { key: SchemaTypeKey; label: string; hint: string }[] = [
  {
    key: "FAQPage",
    label: "FAQPage",
    hint: "Question/answer rich result. Better filled in the FAQ section above unless you need it standalone.",
  },
  {
    key: "BreadcrumbList",
    label: "BreadcrumbList",
    hint: "Replaces the URL display in Google SERPs with a breadcrumb trail. Highest ROI on deep pages.",
  },
  {
    key: "Article",
    label: "Article",
    hint: "News / blog / knowledge-base posts. Required for the Top Stories carousel.",
  },
  {
    key: "HowTo",
    label: "HowTo",
    hint: "Step-by-step procedural content. Still rendered in mobile SERPs in select markets.",
  },
  {
    key: "Review",
    label: "Review",
    hint: "Single review with rating + author. For aggregate ratings use a Product block with aggregateRating.",
  },
  {
    key: "VideoObject",
    label: "VideoObject",
    hint: "Required for video thumbnails in SERPs. Pair with a real .mp4 or YouTube embed on-page.",
  },
  {
    key: "Event",
    label: "Event",
    hint: "Webinars, AGMs, IPO launches. Eligible for the SERP event carousel.",
  },
  {
    key: "Organization",
    label: "Organization",
    hint: "Brand-level identity. Usually emitted site-wide — only override per-page if the page represents a sub-org.",
  },
]

type FaqEntry = { question: string; answer: string }
type HowToStep = { name: string; text: string }
type Breadcrumb = { name: string; url: string }

type GenState = {
  type: SchemaTypeKey
  faq: FaqEntry[]
  breadcrumbs: Breadcrumb[]
  article_headline: string
  article_author: string
  article_date: string
  article_image: string
  article_publisher: string
  howto_name: string
  howto_description: string
  howto_steps: HowToStep[]
  review_item: string
  review_rating: string
  review_author: string
  review_body: string
  video_name: string
  video_description: string
  video_thumbnail: string
  video_upload_date: string
  video_url: string
  event_name: string
  event_start_date: string
  event_end_date: string
  event_location: string
  event_description: string
  event_url: string
  org_name: string
  org_url: string
  org_logo: string
}

const EMPTY: GenState = {
  type: "BreadcrumbList",
  faq: [{ question: "", answer: "" }],
  breadcrumbs: [
    { name: "Home", url: "" },
    { name: "", url: "" },
  ],
  article_headline: "",
  article_author: "",
  article_date: "",
  article_image: "",
  article_publisher: "",
  howto_name: "",
  howto_description: "",
  howto_steps: [{ name: "", text: "" }],
  review_item: "",
  review_rating: "",
  review_author: "",
  review_body: "",
  video_name: "",
  video_description: "",
  video_thumbnail: "",
  video_upload_date: "",
  video_url: "",
  event_name: "",
  event_start_date: "",
  event_end_date: "",
  event_location: "",
  event_description: "",
  event_url: "",
  org_name: "",
  org_url: "",
  org_logo: "",
}

function buildBlock(s: GenState): Record<string, unknown> | { error: string } {
  const ctx = "https://schema.org"
  switch (s.type) {
    case "FAQPage": {
      const filled = s.faq.filter(
        (q) => q.question.trim() && q.answer.trim(),
      )
      if (filled.length === 0) return { error: "Add at least one Q/A pair." }
      return {
        "@context": ctx,
        "@type": "FAQPage",
        mainEntity: filled.map((q) => ({
          "@type": "Question",
          name: q.question.trim(),
          acceptedAnswer: {
            "@type": "Answer",
            text: q.answer.trim(),
          },
        })),
      }
    }
    case "BreadcrumbList": {
      const filled = s.breadcrumbs.filter(
        (b) => b.name.trim() && b.url.trim(),
      )
      if (filled.length < 2) {
        return { error: "Need at least 2 breadcrumb entries with name + URL." }
      }
      return {
        "@context": ctx,
        "@type": "BreadcrumbList",
        itemListElement: filled.map((b, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: b.name.trim(),
          item: b.url.trim(),
        })),
      }
    }
    case "Article": {
      if (!s.article_headline.trim()) {
        return { error: "Headline is required for Article." }
      }
      const out: Record<string, unknown> = {
        "@context": ctx,
        "@type": "Article",
        headline: s.article_headline.trim(),
      }
      if (s.article_author.trim()) {
        out.author = { "@type": "Person", name: s.article_author.trim() }
      }
      if (s.article_date.trim()) {
        out.datePublished = s.article_date.trim()
      }
      if (s.article_image.trim()) {
        out.image = [s.article_image.trim()]
      }
      if (s.article_publisher.trim()) {
        out.publisher = {
          "@type": "Organization",
          name: s.article_publisher.trim(),
        }
      }
      return out
    }
    case "HowTo": {
      if (!s.howto_name.trim()) return { error: "HowTo name is required." }
      const steps = s.howto_steps.filter((x) => x.name.trim() && x.text.trim())
      if (steps.length === 0) {
        return { error: "Add at least one step with a name + text." }
      }
      const out: Record<string, unknown> = {
        "@context": ctx,
        "@type": "HowTo",
        name: s.howto_name.trim(),
        step: steps.map((st, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: st.name.trim(),
          text: st.text.trim(),
        })),
      }
      if (s.howto_description.trim()) {
        out.description = s.howto_description.trim()
      }
      return out
    }
    case "Review": {
      if (!s.review_item.trim() || !s.review_rating.trim()) {
        return { error: "Item reviewed + rating are required." }
      }
      const ratingNum = Number(s.review_rating)
      if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return { error: "Rating must be a number between 1 and 5." }
      }
      const out: Record<string, unknown> = {
        "@context": ctx,
        "@type": "Review",
        itemReviewed: { "@type": "Thing", name: s.review_item.trim() },
        reviewRating: {
          "@type": "Rating",
          ratingValue: ratingNum,
          bestRating: 5,
        },
      }
      if (s.review_author.trim()) {
        out.author = { "@type": "Person", name: s.review_author.trim() }
      }
      if (s.review_body.trim()) {
        out.reviewBody = s.review_body.trim()
      }
      return out
    }
    case "VideoObject": {
      if (!s.video_name.trim() || !s.video_thumbnail.trim()) {
        return { error: "Video name + thumbnailUrl are required." }
      }
      const out: Record<string, unknown> = {
        "@context": ctx,
        "@type": "VideoObject",
        name: s.video_name.trim(),
        thumbnailUrl: [s.video_thumbnail.trim()],
      }
      if (s.video_description.trim()) {
        out.description = s.video_description.trim()
      }
      if (s.video_upload_date.trim()) {
        out.uploadDate = s.video_upload_date.trim()
      }
      if (s.video_url.trim()) {
        out.contentUrl = s.video_url.trim()
      }
      return out
    }
    case "Event": {
      if (!s.event_name.trim() || !s.event_start_date.trim()) {
        return { error: "Event name + startDate are required." }
      }
      const out: Record<string, unknown> = {
        "@context": ctx,
        "@type": "Event",
        name: s.event_name.trim(),
        startDate: s.event_start_date.trim(),
      }
      if (s.event_end_date.trim()) out.endDate = s.event_end_date.trim()
      if (s.event_description.trim()) {
        out.description = s.event_description.trim()
      }
      if (s.event_url.trim()) out.url = s.event_url.trim()
      if (s.event_location.trim()) {
        out.location = {
          "@type": "Place",
          name: s.event_location.trim(),
        }
      }
      return out
    }
    case "Organization": {
      if (!s.org_name.trim() || !s.org_url.trim()) {
        return { error: "Organization name + URL are required." }
      }
      const out: Record<string, unknown> = {
        "@context": ctx,
        "@type": "Organization",
        name: s.org_name.trim(),
        url: s.org_url.trim(),
      }
      if (s.org_logo.trim()) out.logo = s.org_logo.trim()
      return out
    }
  }
}

export const JsonLdGenerator: React.FC<{
  onAppend: (block: Record<string, unknown>) => void
}> = ({ onAppend }) => {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<GenState>(EMPTY)

  const preview = useMemo(() => {
    const r = buildBlock(state)
    return r
  }, [state])

  const previewText = useMemo(() => {
    if ("error" in (preview as object)) return ""
    return JSON.stringify(preview, null, 2)
  }, [preview])

  const append = () => {
    if ("error" in (preview as object)) {
      toast.error("Cannot generate", {
        description: (preview as { error: string }).error,
      })
      return
    }
    onAppend(preview as Record<string, unknown>)
    toast.success("Appended to JSON-LD textarea", {
      description: "Click 'Save overrides' to persist.",
    })
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="small"
          onClick={() => setOpen(true)}
        >
          ⚡ Generate schema block
        </Button>
        <Text size="small" className="text-ui-fg-muted">
          Pick a schema.org type and fill the required fields — we'll
          paste valid JSON-LD into the textarea.
        </Text>
      </div>
    )
  }

  const set = (patch: Partial<GenState>) => setState({ ...state, ...patch })
  const currentMeta = SCHEMA_TYPES.find((s) => s.key === state.type)

  return (
    <div className="flex flex-col gap-3 rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
      <div className="flex items-center justify-between gap-2">
        <Text size="small" weight="plus" className="text-ui-fg-base">
          Schema generator
        </Text>
        <Button
          variant="transparent"
          size="small"
          onClick={() => setOpen(false)}
        >
          Close
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <Label>Schema type</Label>
        <select
          value={state.type}
          onChange={(e) => set({ type: e.target.value as SchemaTypeKey })}
          className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm text-ui-fg-base"
        >
          {SCHEMA_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        {currentMeta && (
          <Text size="xsmall" className="text-ui-fg-muted">
            {currentMeta.hint}
          </Text>
        )}
      </div>

      {state.type === "FAQPage" && (
        <FaqFields
          value={state.faq}
          onChange={(faq) => set({ faq })}
        />
      )}
      {state.type === "BreadcrumbList" && (
        <BreadcrumbFields
          value={state.breadcrumbs}
          onChange={(breadcrumbs) => set({ breadcrumbs })}
        />
      )}
      {state.type === "Article" && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field label="Headline *" v={state.article_headline} onV={(v) => set({ article_headline: v })} />
          <Field label="Author name" v={state.article_author} onV={(v) => set({ article_author: v })} />
          <Field label="Date published (YYYY-MM-DD)" v={state.article_date} onV={(v) => set({ article_date: v })} />
          <Field label="Image URL" v={state.article_image} onV={(v) => set({ article_image: v })} />
          <Field label="Publisher (organization name)" v={state.article_publisher} onV={(v) => set({ article_publisher: v })} />
        </div>
      )}
      {state.type === "HowTo" && (
        <>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Field label="HowTo name *" v={state.howto_name} onV={(v) => set({ howto_name: v })} />
            <Field label="Description" v={state.howto_description} onV={(v) => set({ howto_description: v })} />
          </div>
          <HowToFields
            value={state.howto_steps}
            onChange={(howto_steps) => set({ howto_steps })}
          />
        </>
      )}
      {state.type === "Review" && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field label="Item reviewed *" v={state.review_item} onV={(v) => set({ review_item: v })} />
          <Field label="Rating (1–5) *" v={state.review_rating} onV={(v) => set({ review_rating: v })} />
          <Field label="Author" v={state.review_author} onV={(v) => set({ review_author: v })} />
          <Field label="Review body" v={state.review_body} onV={(v) => set({ review_body: v })} multiline />
        </div>
      )}
      {state.type === "VideoObject" && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field label="Video name *" v={state.video_name} onV={(v) => set({ video_name: v })} />
          <Field label="Thumbnail URL *" v={state.video_thumbnail} onV={(v) => set({ video_thumbnail: v })} />
          <Field label="Description" v={state.video_description} onV={(v) => set({ video_description: v })} multiline />
          <Field label="Upload date (YYYY-MM-DD)" v={state.video_upload_date} onV={(v) => set({ video_upload_date: v })} />
          <Field label="Content URL" v={state.video_url} onV={(v) => set({ video_url: v })} />
        </div>
      )}
      {state.type === "Event" && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field label="Event name *" v={state.event_name} onV={(v) => set({ event_name: v })} />
          <Field label="Start date (ISO) *" v={state.event_start_date} onV={(v) => set({ event_start_date: v })} />
          <Field label="End date (ISO)" v={state.event_end_date} onV={(v) => set({ event_end_date: v })} />
          <Field label="Location name" v={state.event_location} onV={(v) => set({ event_location: v })} />
          <Field label="URL" v={state.event_url} onV={(v) => set({ event_url: v })} />
          <Field label="Description" v={state.event_description} onV={(v) => set({ event_description: v })} multiline />
        </div>
      )}
      {state.type === "Organization" && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field label="Organization name *" v={state.org_name} onV={(v) => set({ org_name: v })} />
          <Field label="URL *" v={state.org_url} onV={(v) => set({ org_url: v })} />
          <Field label="Logo URL" v={state.org_logo} onV={(v) => set({ org_logo: v })} />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Label>Preview</Label>
        {"error" in (preview as object) ? (
          <Text size="xsmall" className="text-ui-fg-error">
            {(preview as { error: string }).error}
          </Text>
        ) : (
          <Textarea
            rows={Math.min(12, previewText.split("\n").length + 1)}
            className="font-mono text-xs"
            value={previewText}
            readOnly
          />
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="small" onClick={() => setState(EMPTY)}>
          Reset
        </Button>
        <Button
          size="small"
          onClick={append}
          disabled={"error" in (preview as object)}
        >
          Append to textarea ↓
        </Button>
      </div>
    </div>
  )
}

const Field: React.FC<{
  label: string
  v: string
  onV: (v: string) => void
  multiline?: boolean
}> = ({ label, v, onV, multiline }) => (
  <div className="flex flex-col gap-1">
    <Label>{label}</Label>
    {multiline ? (
      <Textarea rows={3} value={v} onChange={(e) => onV(e.target.value)} />
    ) : (
      <Input value={v} onChange={(e) => onV(e.target.value)} />
    )}
  </div>
)

const FaqFields: React.FC<{
  value: FaqEntry[]
  onChange: (next: FaqEntry[]) => void
}> = ({ value, onChange }) => (
  <div className="flex flex-col gap-2">
    {value.map((q, i) => (
      <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field
          label={`Question ${i + 1}`}
          v={q.question}
          onV={(v) => {
            const next = [...value]
            next[i] = { ...next[i], question: v }
            onChange(next)
          }}
        />
        <Field
          label="Answer"
          v={q.answer}
          multiline
          onV={(v) => {
            const next = [...value]
            next[i] = { ...next[i], answer: v }
            onChange(next)
          }}
        />
      </div>
    ))}
    <div className="flex gap-2">
      <Button
        variant="secondary"
        size="small"
        onClick={() => onChange([...value, { question: "", answer: "" }])}
      >
        + Add Q/A
      </Button>
      {value.length > 1 && (
        <Button
          variant="transparent"
          size="small"
          onClick={() => onChange(value.slice(0, -1))}
        >
          Remove last
        </Button>
      )}
    </div>
  </div>
)

const BreadcrumbFields: React.FC<{
  value: Breadcrumb[]
  onChange: (next: Breadcrumb[]) => void
}> = ({ value, onChange }) => (
  <div className="flex flex-col gap-2">
    {value.map((b, i) => (
      <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field
          label={`Crumb ${i + 1} name`}
          v={b.name}
          onV={(v) => {
            const next = [...value]
            next[i] = { ...next[i], name: v }
            onChange(next)
          }}
        />
        <Field
          label="URL"
          v={b.url}
          onV={(v) => {
            const next = [...value]
            next[i] = { ...next[i], url: v }
            onChange(next)
          }}
        />
      </div>
    ))}
    <div className="flex gap-2">
      <Button
        variant="secondary"
        size="small"
        onClick={() => onChange([...value, { name: "", url: "" }])}
      >
        + Add crumb
      </Button>
      {value.length > 1 && (
        <Button
          variant="transparent"
          size="small"
          onClick={() => onChange(value.slice(0, -1))}
        >
          Remove last
        </Button>
      )}
    </div>
  </div>
)

const HowToFields: React.FC<{
  value: HowToStep[]
  onChange: (next: HowToStep[]) => void
}> = ({ value, onChange }) => (
  <div className="flex flex-col gap-2">
    {value.map((s, i) => (
      <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field
          label={`Step ${i + 1} name`}
          v={s.name}
          onV={(v) => {
            const next = [...value]
            next[i] = { ...next[i], name: v }
            onChange(next)
          }}
        />
        <Field
          label="Step text"
          v={s.text}
          multiline
          onV={(v) => {
            const next = [...value]
            next[i] = { ...next[i], text: v }
            onChange(next)
          }}
        />
      </div>
    ))}
    <div className="flex gap-2">
      <Button
        variant="secondary"
        size="small"
        onClick={() => onChange([...value, { name: "", text: "" }])}
      >
        + Add step
      </Button>
      {value.length > 1 && (
        <Button
          variant="transparent"
          size="small"
          onClick={() => onChange(value.slice(0, -1))}
        >
          Remove last
        </Button>
      )}
    </div>
  </div>
)
