import { describe, it, expect } from "vitest"
import {
  computeGatewayFeePaise,
  isValidUpiTransactionId,
  amountsMatchPaise,
} from "../payment"

describe("computeGatewayFeePaise", () => {
  it("returns 2% of the total, rounded to the nearest paise", () => {
    expect(computeGatewayFeePaise(100000, 2)).toBe(2000) // ₹1000 -> ₹20
  })
  it("returns 0 when pct is 0", () => {
    expect(computeGatewayFeePaise(100000, 0)).toBe(0)
  })
  it("rounds half-paise up", () => {
    expect(computeGatewayFeePaise(101, 2)).toBe(2) // 2.02 -> 2
  })
  it("clamps negative or NaN pct to 0", () => {
    expect(computeGatewayFeePaise(100000, -5)).toBe(0)
    expect(computeGatewayFeePaise(100000, Number.NaN)).toBe(0)
  })
})

describe("isValidUpiTransactionId", () => {
  it("accepts a 12-char alphanumeric ref", () => {
    expect(isValidUpiTransactionId("AX12BC34DE56")).toBe(true)
  })
  it("rejects empty / whitespace", () => {
    expect(isValidUpiTransactionId("")).toBe(false)
    expect(isValidUpiTransactionId("   ")).toBe(false)
  })
  it("rejects too short (<6) and too long (>40)", () => {
    expect(isValidUpiTransactionId("A1B2C")).toBe(false)
    expect(isValidUpiTransactionId("A".repeat(41))).toBe(false)
  })
  it("rejects non-alphanumeric", () => {
    expect(isValidUpiTransactionId("ABC-123-XYZ")).toBe(false)
    expect(isValidUpiTransactionId("ABC 123 XYZ")).toBe(false)
  })
})

describe("amountsMatchPaise", () => {
  it("matches identical amounts", () => {
    expect(amountsMatchPaise(123456, 123456)).toBe(true)
  })
  it("tolerates a 1-rupee (100 paise) rounding gap by default", () => {
    expect(amountsMatchPaise(123456, 123500)).toBe(true)
  })
  it("rejects a gap larger than tolerance", () => {
    expect(amountsMatchPaise(123456, 130000)).toBe(false)
  })
})
