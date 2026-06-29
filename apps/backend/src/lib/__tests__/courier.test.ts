import { describe, it, expect } from "vitest"
import { normalizeCourierStatus } from "../courier"

/**
 * FR-5.02 — different carriers report transit status with different vocab.
 * normalizeCourierStatus maps a carrier's raw status string onto our canonical
 * set so the dashboard can render a consistent pill regardless of carrier.
 */
describe("normalizeCourierStatus", () => {
  it("maps delivered variants", () => {
    expect(normalizeCourierStatus("Delivered")).toBe("delivered")
    expect(normalizeCourierStatus("DELIVERED_SUCCESSFULLY")).toBe("delivered")
  })

  it("maps out-for-delivery variants", () => {
    expect(normalizeCourierStatus("Out for delivery")).toBe("out_for_delivery")
    expect(normalizeCourierStatus("ofd")).toBe("out_for_delivery")
  })

  it("maps in-transit variants", () => {
    expect(normalizeCourierStatus("In Transit")).toBe("in_transit")
    expect(normalizeCourierStatus("picked_up")).toBe("in_transit")
    expect(normalizeCourierStatus("shipped")).toBe("in_transit")
  })

  it("maps failure variants", () => {
    expect(normalizeCourierStatus("RTO")).toBe("failed")
    expect(normalizeCourierStatus("delivery failed")).toBe("failed")
    expect(normalizeCourierStatus("cancelled")).toBe("failed")
  })

  it("falls back to unknown for unrecognised or empty input", () => {
    expect(normalizeCourierStatus("")).toBe("unknown")
    expect(normalizeCourierStatus("wat")).toBe("unknown")
  })
})
