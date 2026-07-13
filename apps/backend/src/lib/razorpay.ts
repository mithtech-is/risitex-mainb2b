import { createHmac, timingSafeEqual } from "crypto"

/**
 * Shared Razorpay REST + signature helpers. No Medusa container access —
 * pure/env-driven and unit-testable, matching the style of `./payment.ts`.
 *
 * This intentionally duplicates no new crypto: the signature scheme and
 * REST calls mirror three existing, already-proven implementations
 * byte-for-byte —
 *   - `modules/razorpay_provider/service.ts` (`RazorpayClient` +
 *     `RazorpayPaymentProviderService.liveMode()`)
 *   - `api/store/checkout/razorpay/verify/route.ts`
 *   - `api/store/wallet/topup/route.ts` + `topup/verify/route.ts`
 *
 * The one deliberate upgrade over those copies: signature comparison
 * here is timing-safe (`timingSafeEqual` with a length guard) instead of
 * plain `===`, following the pattern already used for Cashfree webhooks
 * in `modules/cashfree_wallet/cashfree/signature.ts`.
 *
 * No `razorpay` npm SDK — talks to the REST API directly via the
 * global `fetch`, same as every existing call site.
 */

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1"

/** True when both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are configured. */
export function razorpayLiveMode(): boolean {
  return !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET
}

/**
 * Verify the (order_id, payment_id, signature) triple Razorpay Checkout
 * hands back to the browser on a successful payment.
 *
 * Signature scheme (identical to `RazorpayClient.verifySignature` and
 * the `/checkout/razorpay/verify` + `/wallet/topup/verify` routes):
 *
 *   HMAC-SHA256(`${order_id}|${payment_id}`, RAZORPAY_KEY_SECRET) → hex
 *
 * Dev pass-through: when RAZORPAY_KEY_SECRET isn't configured, trust
 * the call so storefront e2e flows work without a Razorpay test
 * account (mirrors the verify route's `if (!keySecret) { ...trust... }`
 * branch).
 */
export function verifyRazorpaySignature(a: {
  order_id: string
  payment_id: string
  signature: string
}): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? ""
  if (!keySecret) return true // pass-through dev mode

  const expected = createHmac("sha256", keySecret)
    .update(`${a.order_id}|${a.payment_id}`)
    .digest("hex")
  return timingSafeEqualStr(expected, a.signature)
}

/**
 * Verify a Razorpay webhook delivery's `X-Razorpay-Signature` header.
 *
 * Signature scheme (per Razorpay's webhook docs):
 *
 *   HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET) → hex
 *
 * `rawBody` MUST be the exact bytes Razorpay posted — a re-serialised
 * JSON body can reorder keys/whitespace and break the signature (same
 * caveat as the Cashfree webhook verifier).
 *
 * Dev pass-through does NOT apply here: with no
 * RAZORPAY_WEBHOOK_SECRET configured there is nothing to verify
 * against, so this returns `false` rather than trusting the caller —
 * unlike the checkout signature triple (which a browser can only have
 * obtained by actually completing a Razorpay Checkout), a webhook
 * POST can be forged by anyone who knows the URL. The route calling
 * this decides how to handle "can't verify" (e.g. reject, or log +
 * accept only in explicit dev configurations).
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? ""
  if (!secret) return false
  if (!signatureHeader) return false

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  return timingSafeEqualStr(expected, signatureHeader)
}

/**
 * Create a Razorpay Order.
 *
 * Dev pass-through (RAZORPAY_KEY_ID/SECRET not both set): synthesizes
 * an order id with NO network call — mirrors `initiatePayment`'s
 * pass-through branch in `modules/razorpay_provider/service.ts`.
 *
 * Live: `POST /v1/orders` with HTTP Basic auth (`base64(key_id:key_secret)`),
 * the same envelope as `RazorpayClient.createOrder` and
 * `/store/wallet/topup`'s live branch. Throws on a non-2xx response.
 *
 * Note: Razorpay caps `receipt` at 40 characters — existing call sites
 * truncate before calling (`cartId.slice(0, 40)`); this helper passes
 * `receipt` through unchanged so callers stay in control of that.
 */
export async function createRazorpayOrder(
  amountPaise: number,
  receipt: string,
  notes?: Record<string, string>,
): Promise<{
  mode: "passthrough" | "live"
  key_id: string
  razorpay_order_id: string
  amount_paise: number
  currency: "INR"
}> {
  if (!razorpayLiveMode()) {
    const fakeOrderId = `order_dev_${Math.random().toString(36).slice(2, 12)}`
    return {
      mode: "passthrough",
      key_id: "",
      razorpay_order_id: fakeOrderId,
      amount_paise: amountPaise,
      currency: "INR",
    }
  }

  const keyId = process.env.RAZORPAY_KEY_ID!
  const keySecret = process.env.RAZORPAY_KEY_SECRET!
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")
  const res = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: notes ?? {},
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `razorpay: createOrder failed ${res.status} ${body.slice(0, 200)}`,
    )
  }
  const order = (await res.json()) as { id: string; status: string }
  return {
    mode: "live",
    key_id: keyId,
    razorpay_order_id: order.id,
    amount_paise: amountPaise,
    currency: "INR",
  }
}

/**
 * Fetch a Razorpay payment by id.
 *
 * Dev pass-through (RAZORPAY_KEY_ID/SECRET not both set): returns
 * `null` — no network call, nothing to fetch.
 *
 * Live: `GET /v1/payments/{id}` with HTTP Basic auth, the same lookup
 * `/store/wallet/topup/verify` makes before crediting the wallet.
 * Throws on a non-2xx response.
 */
export async function fetchRazorpayPayment(
  paymentId: string,
): Promise<{ status: string; order_id: string; amount_paise: number } | null> {
  if (!razorpayLiveMode()) return null

  const keyId = process.env.RAZORPAY_KEY_ID!
  const keySecret = process.env.RAZORPAY_KEY_SECRET!
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")
  const res = await fetch(
    `${RAZORPAY_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
    },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `razorpay: fetchPayment failed ${res.status} ${body.slice(0, 200)}`,
    )
  }
  const payment = (await res.json()) as {
    status: string
    order_id: string
    amount: number
  }
  return {
    status: payment.status,
    order_id: payment.order_id,
    amount_paise: payment.amount,
  }
}

/**
 * Timing-safe string comparison for hex (or any ASCII) digests.
 *
 * `timingSafeEqual` throws on unequal-length buffers, so length is
 * checked first — an unequal-length signature simply isn't a match,
 * never a crash. Compares the UTF-8 bytes of the strings themselves
 * (not hex-decoded bytes) so a malformed/non-hex `actual` value can
 * never throw either — same approach as
 * `modules/cashfree_wallet/cashfree/signature.ts`.
 */
function timingSafeEqualStr(expected: string, actual: string | undefined | null): boolean {
  const expectedBuf = Buffer.from(expected, "utf8")
  const actualBuf = Buffer.from(actual ?? "", "utf8")
  if (expectedBuf.length !== actualBuf.length) return false
  return timingSafeEqual(expectedBuf, actualBuf)
}
