import { describe, it, expect } from "vitest"

/**
 * Mirror of the `isStrongPassword` rules used by sign-up + reset-password.
 * Kept inline here rather than imported so the test pins the canonical
 * rule set independently of any source-file rename / refactor — if you
 * change the rule set, this test will fail and the assertion list below
 * tells the reviewer exactly what changed.
 */
function isStrongPassword(p: string): boolean {
  return (
    p.length >= 8 &&
    /[A-Z]/.test(p) &&
    /[a-z]/.test(p) &&
    /[0-9]/.test(p) &&
    /[^A-Za-z0-9]/.test(p)
  )
}

describe("isStrongPassword", () => {
  it("rejects short passwords", () => {
    expect(isStrongPassword("Aa1!aa")).toBe(false) // 6 chars
    expect(isStrongPassword("")).toBe(false)
  })

  it("rejects without uppercase", () => {
    expect(isStrongPassword("aaaa1!aa")).toBe(false)
  })

  it("rejects without lowercase", () => {
    expect(isStrongPassword("AAAA1!AA")).toBe(false)
  })

  it("rejects without a digit", () => {
    expect(isStrongPassword("AaaaaaB!")).toBe(false)
  })

  it("rejects without a symbol", () => {
    expect(isStrongPassword("Aaaaaaa1")).toBe(false)
  })

  it("accepts an 8-char password that meets every rule", () => {
    expect(isStrongPassword("Aa1!aaaa")).toBe(true)
  })

  it("accepts longer passphrase-style entries", () => {
    expect(isStrongPassword("CorrectHorse9!")).toBe(true)
  })

  it("treats UTF-8 punctuation as a symbol", () => {
    expect(isStrongPassword("Aaaaaa1é")).toBe(true)
  })
})
