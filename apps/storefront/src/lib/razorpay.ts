import { MEDUSA_BASE_URL } from "./medusa";

/**
 * Shared storefront client for Razorpay Checkout.
 *
 * Lifts the proven pattern from wallet/instant-topup-section.tsx's inline
 * `openRazorpayCheckout` + `loadScript` helpers into a reusable lib, so
 * other flows (purchase-order payment, etc.) can open the same Checkout
 * overlay without re-implementing the script-load + order-create dance.
 *
 * Two modes — determined by the backend at order-creation time:
 *
 *  - **live**: backend returns a Razorpay order_id + key_id. We open
 *    Razorpay Checkout JS and the customer pays.
 *  - **passthrough**: backend has no Razorpay credentials configured and
 *    short-circuits the flow. Callers should check `mode` on the response
 *    before deciding whether to open Checkout at all.
 */

export type RazorpayOrderResponse = {
  mode: "passthrough" | "live";
  key_id: string;
  razorpay_order_id: string;
  amount_paise: number;
  currency: string;
};

export type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/**
 * Same auth-header + base-URL pattern as lib/wallet.ts's `authFetch`: JWT
 * from localStorage (if present) alongside the publishable key, credentials
 * included for cookie-based sessions.
 */
async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${MEDUSA_BASE_URL}${path}`;
  // The SDK stores its JWT under localStorage key "medusa_auth_token" when
  // configured with auth.type:"jwt", jwtTokenStorageMethod:"local".
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = window.localStorage.getItem("medusa_auth_token");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-publishable-api-key": PUB_KEY,
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...init, headers, credentials: "include" });
  if (!res.ok) {
    let detail = "";
    let devDetail = "";
    try {
      const body = (await res.json()) as { message?: string; detail?: string };
      detail = body?.message ?? "";
      devDetail = body?.detail ?? "";
    } catch {
      // empty
    }
    const tail = detail
      ? ` — ${detail}${devDetail ? ` [${devDetail}]` : ""}`
      : "";
    throw new Error(`${res.status} ${res.statusText}${tail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** POST /store/purchase-orders/razorpay/order — creates a Razorpay order for the given amount. */
export async function startRazorpayOrder(
  amountPaise: number,
): Promise<RazorpayOrderResponse> {
  return authFetch<RazorpayOrderResponse>(
    "/store/purchase-orders/razorpay/order",
    {
      method: "POST",
      body: JSON.stringify({ amount_paise: amountPaise }),
    },
  );
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Idempotent <script> loader for Razorpay Checkout JS. */
export async function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    const existing = document.querySelector(
      `script[src="${RAZORPAY_CHECKOUT_SRC}"]`,
    );
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = RAZORPAY_CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error(`Failed to load ${RAZORPAY_CHECKOUT_SRC}`));
    document.body.appendChild(s);
  });
}

/** Opens the Razorpay Checkout overlay for a previously-created order. */
export async function openRazorpayCheckout(opts: {
  keyId: string;
  orderId: string;
  amount: number;
  onSuccess: (r: RazorpaySuccess) => void;
  onDismiss: () => void;
}): Promise<void> {
  const { keyId, orderId, amount, onSuccess, onDismiss } = opts;
  await loadRazorpayScript();
  if (typeof window === "undefined" || !window.Razorpay) {
    throw new Error("Razorpay Checkout failed to load");
  }
  const rzp = new window.Razorpay({
    key: keyId,
    order_id: orderId,
    amount,
    currency: "INR",
    name: "RISITEX",
    description: "B2B order payment",
    handler: (payload: RazorpaySuccess) => onSuccess(payload),
    modal: { ondismiss: () => onDismiss() },
    theme: { color: "#222222" },
  });
  rzp.open();
}
