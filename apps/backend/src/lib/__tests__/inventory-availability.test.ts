import { describe, it, expect } from "vitest"
import { computeAvailability } from "../inventory-availability"

/**
 * FR-9.02 — the storefront must show "Available Qty" (physical minus
 * stock reserved against pending Sales Orders) to MBOs, never raw
 * physical stock. These tests pin the pure arithmetic; the ERPNext
 * pull and the store endpoint plumbing are exercised separately.
 */
describe("computeAvailability", () => {
  it("subtracts reserved from physical", () => {
    expect(computeAvailability({ physical: 100, reserved: 30 })).toEqual({
      physical: 100,
      reserved: 30,
      available: 70,
    })
  })

  it("treats a missing reserved figure as zero", () => {
    expect(computeAvailability({ physical: 40, reserved: null })).toEqual({
      physical: 40,
      reserved: 0,
      available: 40,
    })
  })

  it("never reports negative availability when reserved exceeds physical", () => {
    expect(computeAvailability({ physical: 10, reserved: 25 })).toEqual({
      physical: 10,
      reserved: 25,
      available: 0,
    })
  })

  it("reports unmanaged stock as null availability", () => {
    expect(
      computeAvailability({ physical: null, reserved: null, manageInventory: false }),
    ).toEqual({ physical: null, reserved: 0, available: null })
  })

  it("treats a null physical figure as unmanaged even if inventory is managed", () => {
    expect(computeAvailability({ physical: null, reserved: 5 })).toEqual({
      physical: null,
      reserved: 5,
      available: null,
    })
  })
})
