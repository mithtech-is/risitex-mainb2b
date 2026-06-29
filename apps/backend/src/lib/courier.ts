/**
 * FR-5.02 — live courier tracking.
 *
 * Carrier-agnostic tracking: a CourierAdapter fetches the latest transit status
 * for an AWB, and normalizeCourierStatus maps each carrier's vocab onto our
 * canonical set. The poll-courier-tracking job calls the adapter for in-transit
 * shipments and caches the result on the shipment_transporter row, which the
 * storefront shipments page renders.
 */

export type CourierStatus =
  | "pending"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "unknown"

/** Map a carrier's raw status string onto our canonical CourierStatus. */
export function normalizeCourierStatus(raw: string): CourierStatus {
  const s = (raw ?? "").toLowerCase().replace(/[^a-z]/g, "")
  if (!s) return "unknown"
  if (s.includes("deliver") && (s.includes("fail") || s.includes("undeliver")))
    return "failed"
  if (s.includes("delivered")) return "delivered"
  if (s.includes("outfordelivery") || s === "ofd") return "out_for_delivery"
  if (
    s.includes("intransit") ||
    s.includes("pickedup") ||
    s.includes("shipped") ||
    s.includes("dispatched")
  )
    return "in_transit"
  if (s.includes("rto") || s.includes("fail") || s.includes("cancel"))
    return "failed"
  if (s.includes("pending") || s.includes("created") || s.includes("booked"))
    return "pending"
  return "unknown"
}

export type CourierTracking = {
  status: CourierStatus
  raw_status: string
  last_event?: string | null
}

/**
 * A carrier integration. `track(awb)` returns the latest status, or null when
 * the carrier can't be queried (missing config, unknown carrier, transient
 * error) — callers leave the cached status untouched in that case.
 */
export type CourierAdapter = {
  code: string
  track: (awb: string) => Promise<CourierTracking | null>
}

/**
 * Porter adapter.
 *
 * INTEGRATION POINT — verify against Porter's tracking API docs before relying
 * on this. Set PORTER_TRACKING_URL to the tracking endpoint template (use
 * `{awb}` as the placeholder) and PORTER_API_KEY for auth. Until PORTER_TRACKING_URL
 * is set, track() returns null (no-op). The exact response field for status is
 * read from `status` / `current_status`; adjust the mapping if Porter differs.
 */
const porterAdapter: CourierAdapter = {
  code: "porter",
  async track(awb: string): Promise<CourierTracking | null> {
    const tpl = process.env.PORTER_TRACKING_URL
    const key = process.env.PORTER_API_KEY
    if (!tpl || !awb) return null
    try {
      const url = tpl.replace("{awb}", encodeURIComponent(awb))
      const res = await fetch(url, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
      })
      if (!res.ok) return null
      const body = (await res.json().catch(() => ({}))) as {
        status?: string
        current_status?: string
        last_event?: string
      }
      const raw = body.status ?? body.current_status ?? ""
      return {
        status: normalizeCourierStatus(raw),
        raw_status: raw,
        last_event: body.last_event ?? null,
      }
    } catch {
      return null
    }
  },
}

const ADAPTERS: Record<string, CourierAdapter> = {
  porter: porterAdapter,
}

/** Resolve a carrier adapter by transporter code, or null if unsupported. */
export function getCourierAdapter(code: string | null | undefined): CourierAdapter | null {
  if (!code) return null
  return ADAPTERS[code.trim().toLowerCase()] ?? null
}
