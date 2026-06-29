import { describe, it, expect } from "vitest"
import { toIndianE164 } from "../verification"

describe("toIndianE164", () => {
  it("normalises a plain 10-digit number", () => {
    expect(toIndianE164("9876543210")).toBe("+919876543210")
  })

  it("normalises a number with country prefix without +", () => {
    expect(toIndianE164("919876543210")).toBe("+919876543210")
  })

  it("normalises a number already in E.164", () => {
    expect(toIndianE164("+919876543210")).toBe("+919876543210")
  })

  it("strips spaces, parens, and hyphens", () => {
    expect(toIndianE164("+91 98765 43210")).toBe("+919876543210")
    expect(toIndianE164("(98765)-43210")).toBe("+919876543210")
  })

  it("rejects numbers shorter than 10 digits", () => {
    expect(() => toIndianE164("12345")).toThrow()
  })

  it("rejects numbers longer than 12 digits", () => {
    expect(() => toIndianE164("9191919191919")).toThrow()
  })

  it("rejects 10-digit numbers starting with 0-5 (not valid Indian mobile)", () => {
    expect(() => toIndianE164("1876543210")).toThrow()
    expect(() => toIndianE164("5876543210")).toThrow()
  })

  it("accepts 10-digit numbers starting with 6-9", () => {
    expect(toIndianE164("6876543210")).toBe("+916876543210")
    expect(toIndianE164("7876543210")).toBe("+917876543210")
    expect(toIndianE164("8876543210")).toBe("+918876543210")
    expect(toIndianE164("9876543210")).toBe("+919876543210")
  })

  it("rejects empty string", () => {
    expect(() => toIndianE164("")).toThrow()
  })
})
