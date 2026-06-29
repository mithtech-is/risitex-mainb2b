import { describe, it, expect } from "vitest"
import { parseVolumeTiers, resolveVolumeDiscount } from "../volume-discount"

/**
 * FR-6.03 — automatic, no-code volume discounts: when a B2B cart's total units
 * cross a configured threshold, the matching percentage applies. These pure
 * helpers parse the tier config and pick the best matching tier for a cart.
 */
describe("parseVolumeTiers", () => {
  it("parses a JSON array of tiers", () => {
    expect(parseVolumeTiers('[{"min_units":300,"percent":5}]')).toEqual([
      { min_units: 300, percent: 5 },
    ])
  })

  it("sorts tiers by min_units descending (best-first)", () => {
    expect(
      parseVolumeTiers('[{"min_units":300,"percent":5},{"min_units":600,"percent":8}]'),
    ).toEqual([
      { min_units: 600, percent: 8 },
      { min_units: 300, percent: 5 },
    ])
  })

  it("returns [] for empty or malformed config", () => {
    expect(parseVolumeTiers("")).toEqual([])
    expect(parseVolumeTiers("not json")).toEqual([])
    expect(parseVolumeTiers('{"min_units":1}')).toEqual([]) // not an array
  })

  it("drops entries with non-positive units or percent", () => {
    expect(
      parseVolumeTiers('[{"min_units":0,"percent":5},{"min_units":300,"percent":0}]'),
    ).toEqual([])
  })
})

describe("resolveVolumeDiscount", () => {
  const tiers = [
    { min_units: 600, percent: 8 },
    { min_units: 300, percent: 5 },
  ]

  it("returns null below the lowest threshold", () => {
    expect(resolveVolumeDiscount(100, tiers)).toBeNull()
  })

  it("returns the matching tier at the threshold", () => {
    expect(resolveVolumeDiscount(300, tiers)).toEqual({ min_units: 300, percent: 5 })
  })

  it("returns the highest tier the cart qualifies for", () => {
    expect(resolveVolumeDiscount(650, tiers)).toEqual({ min_units: 600, percent: 8 })
  })

  it("returns null when there are no tiers", () => {
    expect(resolveVolumeDiscount(1000, [])).toBeNull()
  })
})
