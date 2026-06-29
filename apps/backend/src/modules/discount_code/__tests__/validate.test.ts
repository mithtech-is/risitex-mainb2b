import { describe, it, expect } from "vitest"
import { validateDiscountCode } from "../validate"

const base = {
  active: true,
  expires_at: null as Date | null,
  min_order_units: 60,
}

describe("validateDiscountCode", () => {
  it("passes when active, unexpired, and units meet the minimum", () => {
    expect(validateDiscountCode(base, { cartUnits: 60, now: new Date("2026-06-18") }))
      .toEqual({ ok: true })
  })

  it("rejects an inactive code", () => {
    expect(validateDiscountCode({ ...base, active: false }, { cartUnits: 100, now: new Date() }))
      .toEqual({ ok: false, reason: "invalid_code" })
  })

  it("rejects an expired code", () => {
    expect(
      validateDiscountCode(
        { ...base, expires_at: new Date("2026-06-01") },
        { cartUnits: 100, now: new Date("2026-06-18") },
      ),
    ).toEqual({ ok: false, reason: "expired" })
  })

  it("rejects when cart units are below the minimum", () => {
    expect(validateDiscountCode(base, { cartUnits: 59, now: new Date("2026-06-18") }))
      .toEqual({ ok: false, reason: "below_min_units", min: 60, have: 59 })
  })

  it("treats a zero minimum as no minimum", () => {
    expect(validateDiscountCode({ ...base, min_order_units: 0 }, { cartUnits: 1, now: new Date() }))
      .toEqual({ ok: true })
  })
})
