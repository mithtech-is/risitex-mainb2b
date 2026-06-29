import { describe, it, expect, beforeEach } from "vitest"
import { hitRateLimit } from "../rate-limit"

/**
 * Unit tests for the in-memory fallback path of `hitRateLimit`.
 *
 * The Redis-backed path is exercised under integration; these tests
 * pin the no-Redis behaviour so a regression in the fallback
 * (which protects single-instance dev + the degraded-Redis case)
 * surfaces immediately.
 */

beforeEach(() => {
  // Make sure no stale REDIS_URL leaks in from the dev shell — the
  // fallback path is what we want to exercise here.
  delete process.env.REDIS_URL
})

describe("hitRateLimit (memory fallback)", () => {
  it("allows the first request and reports remaining=limit-1", () => {
    const r = hitRateLimit(`rl-test-1:${Math.random()}`, 3, 1000)
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(2)
  })

  it("blocks the request after the limit is exhausted", () => {
    const key = `rl-test-2:${Math.random()}`
    hitRateLimit(key, 2, 1000)
    hitRateLimit(key, 2, 1000)
    const r = hitRateLimit(key, 2, 1000)
    expect(r.allowed).toBe(false)
    // TS narrows the union via the discriminant `allowed: false`
    // → `reason` becomes available on the narrowed type.
    if (r.allowed === false) {
      expect(r.reason).toMatch(/limit_exceeded/)
      expect(r.reset_at).toBeGreaterThan(Date.now())
    }
  })

  it("doesn't bump the counter on dryRun=true", () => {
    const key = `rl-test-3:${Math.random()}`
    hitRateLimit(key, 2, 1000) // count = 1
    const peek = hitRateLimit(key, 2, 1000, true) // dryRun
    expect(peek.allowed).toBe(true)
    const real = hitRateLimit(key, 2, 1000) // count = 2 (NOT 3)
    expect(real.allowed).toBe(true)
    const overflow = hitRateLimit(key, 2, 1000) // count = 3 → blocked
    expect(overflow.allowed).toBe(false)
  })

  it("resets after the window elapses", async () => {
    const key = `rl-test-4:${Math.random()}`
    hitRateLimit(key, 1, 50) // count = 1, window 50ms
    const blocked = hitRateLimit(key, 1, 50)
    expect(blocked.allowed).toBe(false)
    await new Promise((r) => setTimeout(r, 80))
    const renewed = hitRateLimit(key, 1, 50)
    expect(renewed.allowed).toBe(true)
  })

  it("uses separate buckets per key", () => {
    const r1 = hitRateLimit(`rl-test-5a:${Math.random()}`, 1, 1000)
    const r2 = hitRateLimit(`rl-test-5b:${Math.random()}`, 1, 1000)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
  })
})
