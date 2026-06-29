import {
  AbstractPaymentProvider,
  MedusaError,
} from "@medusajs/framework/utils"
import { createHmac } from "crypto"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  PaymentSessionStatus,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"

type ProviderOptions = {
  key_id?: string
  key_secret?: string
  webhook_secret?: string
}

/**
 * Razorpay REST client — tiny, deliberately no SDK dependency.
 *
 * Auth: HTTP Basic with `${key_id}:${key_secret}`.
 * Docs: https://razorpay.com/docs/api/orders/
 */
class RazorpayClient {
  constructor(private readonly opts: { keyId: string; keySecret: string }) {}

  private auth(): string {
    return Buffer.from(`${this.opts.keyId}:${this.opts.keySecret}`).toString(
      "base64",
    )
  }

  async createOrder(args: {
    amount_paise: number
    currency: string
    receipt: string
    notes?: Record<string, string>
  }): Promise<{ id: string; status: string }> {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${this.auth()}`,
      },
      body: JSON.stringify({
        amount: args.amount_paise,
        currency: args.currency,
        receipt: args.receipt,
        notes: args.notes ?? {},
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `razorpay: createOrder failed ${res.status} ${body}`,
      )
    }
    return (await res.json()) as { id: string; status: string }
  }

  async capturePayment(paymentId: string, amountPaise: number, currency: string): Promise<{
    id: string
    status: string
    captured: boolean
  }> {
    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${paymentId}/capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${this.auth()}`,
        },
        body: JSON.stringify({ amount: amountPaise, currency }),
      },
    )
    if (!res.ok) {
      const body = await res.text()
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `razorpay: capturePayment failed ${res.status} ${body}`,
      )
    }
    return (await res.json()) as { id: string; status: string; captured: boolean }
  }

  async refundPayment(paymentId: string, amountPaise: number): Promise<{
    id: string
    status: string
  }> {
    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${paymentId}/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${this.auth()}`,
        },
        body: JSON.stringify({ amount: amountPaise }),
      },
    )
    if (!res.ok) {
      const body = await res.text()
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `razorpay: refundPayment failed ${res.status} ${body}`,
      )
    }
    return (await res.json()) as { id: string; status: string }
  }

  /** Verify the (order_id, payment_id, signature) triple from Razorpay
   *  Checkout via HMAC-SHA256 using the secret. */
  static verifySignature(args: {
    order_id: string
    payment_id: string
    signature: string
    key_secret: string
  }): boolean {
    const expected = createHmac("sha256", args.key_secret)
      .update(`${args.order_id}|${args.payment_id}`)
      .digest("hex")
    return expected === args.signature
  }
}

type Dependencies = Record<string, unknown>

/**
 * Razorpay payment provider (id: `razorpay` → key `pp_razorpay_razorpay`).
 *
 * Flow per checkout:
 *   1. `initiatePayment` — create a Razorpay Order via REST. Returns
 *      `data: { razorpay_order_id, key_id, amount_paise, currency }`.
 *      The storefront uses these to open Razorpay Checkout in the
 *      browser. Status `pending`.
 *   2. (browser) User completes payment. Razorpay Checkout returns
 *      (razorpay_payment_id, razorpay_signature) to the storefront.
 *   3. The storefront POSTs the triple to /store/checkout/razorpay/verify
 *      which verifies the HMAC and updates this session's data with
 *      `razorpay_payment_id` + `razorpay_signature` + `verified: true`.
 *   4. `authorizePayment` — checks `verified: true`, optionally captures
 *      (if not auto-captured by Razorpay), returns `authorized`. Medusa
 *      then mints the Order.
 *   5. `capturePayment` — no-op when Razorpay already captured;
 *      otherwise calls /payments/{id}/capture.
 *   6. `refundPayment` — POST /payments/{id}/refund.
 *
 * Pass-through mode:
 *   When RAZORPAY_KEY_ID/SECRET are unset (dev environments without
 *   a Razorpay test account), the provider returns synthetic order
 *   IDs and auto-authorizes. The storefront skips opening the
 *   Razorpay Checkout overlay when key_id is empty.
 */
export class RazorpayPaymentProviderService extends AbstractPaymentProvider<ProviderOptions> {
  static identifier = "razorpay"

  protected readonly options_: ProviderOptions

  constructor(_cradle: Dependencies, options?: ProviderOptions) {
    super(_cradle as Record<string, unknown>, options)
    this.options_ = {
      key_id: options?.key_id ?? process.env.RAZORPAY_KEY_ID ?? "",
      key_secret: options?.key_secret ?? process.env.RAZORPAY_KEY_SECRET ?? "",
      webhook_secret:
        options?.webhook_secret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
    }
  }

  private liveMode(): boolean {
    return !!this.options_.key_id && !!this.options_.key_secret
  }

  private client(): RazorpayClient {
    if (!this.liveMode()) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "razorpay: live mode requires RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET",
      )
    }
    return new RazorpayClient({
      keyId: this.options_.key_id!,
      keySecret: this.options_.key_secret!,
    })
  }

  private toPaise(amount: unknown): number {
    const n =
      typeof amount === "number"
        ? amount
        : typeof amount === "string"
          ? Number(amount)
          : typeof amount === "bigint"
            ? Number(amount)
            : Number((amount as { numeric?: number })?.numeric ?? NaN)
    if (!Number.isFinite(n)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `razorpay: invalid amount ${String(amount)}`,
      )
    }
    return Math.round(n * 100)
  }

  async initiatePayment(
    input: InitiatePaymentInput,
  ): Promise<InitiatePaymentOutput> {
    const amountPaise = this.toPaise(input.amount)
    const currency = (input.currency_code ?? "INR").toUpperCase()
    const cartId =
      ((input.context as unknown as Record<string, unknown>)?.cart_id as
        | string
        | undefined) ??
      (input.data as { cart_id?: string } | undefined)?.cart_id ??
      `cart-${Date.now()}`

    if (!this.liveMode()) {
      // Pass-through: synthesize an order id so the cart workflow has
      // something stable to key off. The storefront detects empty
      // key_id and skips opening the Razorpay Checkout overlay.
      const fakeOrderId = `order_dev_${Math.random().toString(36).slice(2, 12)}`
      return {
        id: fakeOrderId,
        status: "pending" as PaymentSessionStatus,
        data: {
          razorpay_order_id: fakeOrderId,
          key_id: "",
          amount_paise: amountPaise,
          currency,
          mode: "passthrough",
          cart_id: cartId,
        },
      }
    }

    const order = await this.client().createOrder({
      amount_paise: amountPaise,
      currency,
      receipt: cartId.slice(0, 40),
      notes: { cart_id: cartId },
    })
    return {
      id: order.id,
      status: "pending" as PaymentSessionStatus,
      data: {
        razorpay_order_id: order.id,
        key_id: this.options_.key_id!,
        amount_paise: amountPaise,
        currency,
        mode: "live",
        cart_id: cartId,
      },
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput,
  ): Promise<AuthorizePaymentOutput> {
    const data = (input.data ?? {}) as {
      mode?: string
      verified?: boolean
      razorpay_payment_id?: string
      razorpay_order_id?: string
      razorpay_signature?: string
    }

    // Pass-through dev mode auto-authorizes so checkout flows can be
    // smoke-tested end-to-end without a Razorpay test account.
    if (data.mode === "passthrough") {
      return {
        status: "authorized" as PaymentSessionStatus,
        data: { ...(data as Record<string, unknown>), authorized: true },
      }
    }

    // Live mode: require the verify route to have already validated
    // the signature triple and set `verified: true` on session data.
    if (!data.verified) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "razorpay: payment not verified — call /store/checkout/razorpay/verify first",
      )
    }
    if (
      !data.razorpay_payment_id ||
      !data.razorpay_order_id ||
      !data.razorpay_signature
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "razorpay: missing payment_id / order_id / signature on session data",
      )
    }
    // Defensive re-check of the signature at authorize time — the
    // verify route already does this, but provider methods can be
    // invoked by other code paths.
    const ok = RazorpayClient.verifySignature({
      order_id: data.razorpay_order_id,
      payment_id: data.razorpay_payment_id,
      signature: data.razorpay_signature,
      key_secret: this.options_.key_secret!,
    })
    if (!ok) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "razorpay: HMAC signature mismatch",
      )
    }
    return {
      status: "authorized" as PaymentSessionStatus,
      data: { ...(data as Record<string, unknown>), authorized: true },
    }
  }

  async capturePayment(
    input: CapturePaymentInput,
  ): Promise<CapturePaymentOutput> {
    const data = (input.data ?? {}) as {
      mode?: string
      razorpay_payment_id?: string
      amount_paise?: number
      currency?: string
      captured?: boolean
    }
    if (data.mode === "passthrough" || data.captured) {
      return { data: { ...(data as Record<string, unknown>), captured: true } }
    }
    if (!data.razorpay_payment_id) {
      // Authorize-only flow without a payment id is a configuration
      // error — surface it so we don't silently leave money in
      // pre-authorised limbo.
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "razorpay: missing razorpay_payment_id at capture",
      )
    }
    // Capture the amount we recorded at initiatePayment time. The
    // CapturePaymentInput type doesn't carry an amount field — the
    // session's `data.amount_paise` is the canonical value.
    const captureAmount = data.amount_paise ?? 0
    if (!captureAmount) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "razorpay: missing amount_paise on session data at capture",
      )
    }
    const captured = await this.client().capturePayment(
      data.razorpay_payment_id,
      captureAmount,
      (data.currency ?? "INR").toUpperCase(),
    )
    return {
      data: {
        ...(data as Record<string, unknown>),
        captured: true,
        razorpay_capture_status: captured.status,
      },
    }
  }

  async cancelPayment(
    input: CancelPaymentInput,
  ): Promise<CancelPaymentOutput> {
    // Razorpay orders don't need explicit cancellation — uncompleted
    // orders simply expire. If we already have a captured payment,
    // the right move is a refund (callers should hit refundPayment),
    // not cancel.
    return {
      data: {
        ...((input.data as Record<string, unknown>) ?? {}),
        cancelled: true,
      },
    }
  }

  async deletePayment(
    input: DeletePaymentInput,
  ): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async refundPayment(
    input: RefundPaymentInput,
  ): Promise<RefundPaymentOutput> {
    const data = (input.data ?? {}) as {
      mode?: string
      razorpay_payment_id?: string
    }
    const refundPaise = this.toPaise(input.amount)
    if (data.mode === "passthrough") {
      return {
        data: {
          ...(data as Record<string, unknown>),
          refunded: refundPaise,
          mode: "passthrough",
        },
      }
    }
    if (!data.razorpay_payment_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "razorpay: missing razorpay_payment_id at refund",
      )
    }
    const refund = await this.client().refundPayment(
      data.razorpay_payment_id,
      refundPaise,
    )
    return {
      data: {
        ...(data as Record<string, unknown>),
        refunded: refundPaise,
        razorpay_refund_id: refund.id,
        razorpay_refund_status: refund.status,
      },
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput,
  ): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async updatePayment(
    input: UpdatePaymentInput,
  ): Promise<UpdatePaymentOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>
    const newPaise = this.toPaise(input.amount)
    return {
      data: { ...data, amount_paise: newPaise },
    }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput,
  ): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as {
      verified?: boolean
      captured?: boolean
      mode?: string
    }
    if (data.captured) return { status: "captured" as PaymentSessionStatus }
    if (data.verified || data.mode === "passthrough") {
      return { status: "authorized" as PaymentSessionStatus }
    }
    return { status: "pending" as PaymentSessionStatus }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    // Razorpay webhook fan-out (payment.authorized, payment.captured,
    // payment.failed, refund.processed). Wire when a public webhook
    // URL is available; until then events flow synchronously via the
    // verify route. The signature is checked at the express layer
    // before any of this fires.
    const event = (payload as { event?: string }).event ?? ""
    if (event === "payment.captured") {
      return {
        action: "captured",
        data: { session_id: "" },
      } as WebhookActionResult
    }
    return { action: "not_supported" } as WebhookActionResult
  }
}
