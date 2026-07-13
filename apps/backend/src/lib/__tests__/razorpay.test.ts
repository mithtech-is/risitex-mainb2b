import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "crypto"
import {
  razorpayLiveMode,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  createRazorpayOrder,
  fetchRazorpayPayment,
} from "../razorpay"

/**
 * Unit tests for the shared Razorpay helper. Signature verification is
 * security-critical, so KNOWN-GOOD signatures are computed in-test with
 * `createHmac` (the same primitive the lib uses) rather than hard-coded
 * as string constants — this pins the *scheme*
 * (`${order_id}|${payment_id}` / rawBody, sha256, hex) without risking a
 * hand-copied constant silently drifting from the implementation.
 */

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  // Start every test from a clean slate — delete the vars this module
  // reads so a stray value from the dev shell can't leak into a test.
  delete process.env.RAZORPAY_KEY_ID
  delete process.env.RAZORPAY_KEY_SECRET
  delete process.env.RAZORPAY_WEBHOOK_SECRET
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.restoreAllMocks()
})

describe("razorpayLiveMode", () => {
  it("is false when neither RAZORPAY_KEY_ID nor RAZORPAY_KEY_SECRET is set", () => {
    expect(razorpayLiveMode()).toBe(false)
  })

  it("is false when only key_id is set", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_123"
    expect(razorpayLiveMode()).toBe(false)
  })

  it("is false when only key_secret is set", () => {
    process.env.RAZORPAY_KEY_SECRET = "shh"
    expect(razorpayLiveMode()).toBe(false)
  })

  it("is true when both key_id and key_secret are set", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_123"
    process.env.RAZORPAY_KEY_SECRET = "shh"
    expect(razorpayLiveMode()).toBe(true)
  })
})

describe("verifyRazorpaySignature", () => {
  const order_id = "order_test_abc123"
  const payment_id = "pay_test_xyz789"

  it("passthrough: returns true when RAZORPAY_KEY_SECRET is unset, regardless of signature", () => {
    expect(
      verifyRazorpaySignature({ order_id, payment_id, signature: "anything" }),
    ).toBe(true)
    expect(verifyRazorpaySignature({ order_id, payment_id, signature: "" })).toBe(
      true,
    )
  })

  it("returns true for a KNOWN-GOOD signature: HMAC-SHA256(`${order_id}|${payment_id}`, secret) hex", () => {
    process.env.RAZORPAY_KEY_SECRET = "test_secret_abc123"
    const signature = createHmac("sha256", "test_secret_abc123")
      .update(`${order_id}|${payment_id}`)
      .digest("hex")
    expect(verifyRazorpaySignature({ order_id, payment_id, signature })).toBe(true)
  })

  it("returns false for a tampered signature (same length, different bytes)", () => {
    process.env.RAZORPAY_KEY_SECRET = "test_secret_abc123"
    const signature = createHmac("sha256", "test_secret_abc123")
      .update(`${order_id}|${payment_id}`)
      .digest("hex")
    const flippedChar = signature[0] === "a" ? "b" : "a"
    const tampered = flippedChar + signature.slice(1)
    expect(
      verifyRazorpaySignature({ order_id, payment_id, signature: tampered }),
    ).toBe(false)
  })

  it("returns false, and never throws, for a wrong-length signature", () => {
    process.env.RAZORPAY_KEY_SECRET = "test_secret_abc123"
    expect(() =>
      verifyRazorpaySignature({ order_id, payment_id, signature: "short" }),
    ).not.toThrow()
    expect(
      verifyRazorpaySignature({ order_id, payment_id, signature: "short" }),
    ).toBe(false)
    expect(
      verifyRazorpaySignature({ order_id, payment_id, signature: "" }),
    ).toBe(false)
  })

  it("returns false when the signature was computed for a different payment_id (no cross-payment replay)", () => {
    process.env.RAZORPAY_KEY_SECRET = "test_secret_abc123"
    const signature = createHmac("sha256", "test_secret_abc123")
      .update(`${order_id}|${payment_id}`)
      .digest("hex")
    expect(
      verifyRazorpaySignature({
        order_id,
        payment_id: "pay_someone_else",
        signature,
      }),
    ).toBe(false)
  })

  it("returns false when signed with the wrong secret", () => {
    process.env.RAZORPAY_KEY_SECRET = "the_real_secret"
    const signature = createHmac("sha256", "a_different_secret")
      .update(`${order_id}|${payment_id}`)
      .digest("hex")
    expect(verifyRazorpaySignature({ order_id, payment_id, signature })).toBe(
      false,
    )
  })
})

describe("verifyRazorpayWebhookSignature", () => {
  const rawBody = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_test_xyz789" } } },
  })

  it("returns false when RAZORPAY_WEBHOOK_SECRET is unset (cannot verify without a secret — no trust-by-default)", () => {
    expect(verifyRazorpayWebhookSignature(rawBody, "anything")).toBe(false)
    expect(verifyRazorpayWebhookSignature(rawBody, undefined)).toBe(false)
  })

  it("returns false when the secret is set but the signature header is missing", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_xyz"
    expect(verifyRazorpayWebhookSignature(rawBody, undefined)).toBe(false)
  })

  it("returns true for a correct HMAC-SHA256(rawBody, secret) hex digest", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_xyz"
    const signature = createHmac("sha256", "webhook_secret_xyz")
      .update(rawBody)
      .digest("hex")
    expect(verifyRazorpayWebhookSignature(rawBody, signature)).toBe(true)
  })

  it("returns false for a tampered signature (same length, different bytes)", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_xyz"
    const signature = createHmac("sha256", "webhook_secret_xyz")
      .update(rawBody)
      .digest("hex")
    const flippedChar = signature[0] === "a" ? "b" : "a"
    const tampered = flippedChar + signature.slice(1)
    expect(verifyRazorpayWebhookSignature(rawBody, tampered)).toBe(false)
  })

  it("returns false when the body was tampered with after signing", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_xyz"
    const signature = createHmac("sha256", "webhook_secret_xyz")
      .update(rawBody)
      .digest("hex")
    expect(verifyRazorpayWebhookSignature(rawBody + "tampered", signature)).toBe(
      false,
    )
  })

  it("returns false, and never throws, for a wrong-length signature", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_xyz"
    expect(() =>
      verifyRazorpayWebhookSignature(rawBody, "tooshort"),
    ).not.toThrow()
    expect(verifyRazorpayWebhookSignature(rawBody, "tooshort")).toBe(false)
  })
})

describe("createRazorpayOrder (dev pass-through)", () => {
  it("returns a synthetic order with no live keys configured, and makes no network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const result = await createRazorpayOrder(50000, "receipt_1", { foo: "bar" })
    expect(result).toEqual({
      mode: "passthrough",
      key_id: "",
      razorpay_order_id: expect.stringMatching(/^order_dev_/),
      amount_paise: 50000,
      currency: "INR",
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("fetchRazorpayPayment (dev pass-through)", () => {
  it("returns null with no live keys configured, and makes no network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const result = await fetchRazorpayPayment("pay_whatever")
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
