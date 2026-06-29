import { MedusaContainer } from "@medusajs/framework/types"
import { LOGISTICS_MODULE } from "../modules/logistics"
import { getCourierAdapter } from "../lib/courier"

/**
 * FR-5.02 — live courier tracking poll.
 *
 * Every 15 minutes, for each shipment that has an AWB and isn't already in a
 * terminal state (delivered/failed), ask the carrier's adapter for the latest
 * status and cache it on the shipment_transporter row. The storefront shipments
 * page renders the cached `live_status`.
 *
 * Carriers without an adapter (or unconfigured ones, e.g. Porter before
 * PORTER_TRACKING_URL is set) are skipped silently — the dashboard simply shows
 * dispatch state until live tracking is wired.
 */
export default async function pollCourierTracking(container: MedusaContainer) {
  const logistics: any = container.resolve(LOGISTICS_MODULE)
  let rows: any[] = []
  try {
    rows = await logistics.listShipmentTransporters({})
  } catch (err: any) {
    console.warn("[courier-poll] list failed — skipping tick:", err?.message)
    return
  }

  const open = rows.filter(
    (r) =>
      r.awb &&
      r.live_status !== "delivered" &&
      r.live_status !== "failed",
  )

  let updated = 0
  for (const r of open) {
    const adapter = getCourierAdapter(r.transporter_code)
    if (!adapter) continue
    let tracking
    try {
      tracking = await adapter.track(r.awb)
    } catch (err: any) {
      console.warn(`[courier-poll] ${r.transporter_code} ${r.awb} failed:`, err?.message)
      continue
    }
    if (!tracking) continue
    await logistics.updateShipmentTransporters([
      {
        id: r.id,
        live_status: tracking.status,
        live_status_raw: tracking.raw_status,
        live_status_event: tracking.last_event ?? null,
        live_status_at: new Date(),
      },
    ])
    updated += 1
  }
  if (updated > 0) {
    console.log(`[courier-poll] updated ${updated} shipment(s)`)
  }
}

export const config = {
  name: "courier-poll",
  schedule: "*/15 * * * *",
}
