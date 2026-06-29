"use client";

import * as React from "react";
import {
  Badge,
  Button,
  Input,
  Label,
  formatINR,
} from "@risitex/ui/components";
import { Zap } from "lucide-react";
import {
  fetchBankAccounts,
  startWalletTopup,
  verifyWalletTopup,
} from "@/lib/wallet";

/**
 * Instant wallet top-up via Razorpay.
 *
 * Two modes — determined by the backend at request time:
 *
 *  - **live**: backend returns a Razorpay order_id + key_id. We open
 *    Razorpay Checkout JS, customer pays, webhook credits the wallet.
 *    Storefront polls the wallet balance until the credit lands.
 *
 *  - **dev-pass-through**: backend has no Razorpay credentials configured.
 *    It credits the wallet inline and returns a `transaction` row. We just
 *    show the success state and the parent re-fetches the balance.
 *
 * UI is identical in both modes — the underlying mechanism is the only
 * thing that differs.
 */
export function InstantTopupSection({
  onCredited,
}: {
  onCredited?: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const amountPaise = Math.round(Number(amount) * 100);
  const amountOk =
    Number.isFinite(amountPaise) && amountPaise >= 100 && amountPaise <= 100_000_000;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountOk) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    // Require a bank account on file before allowing a wallet top-up.
    try {
      const banks = await fetchBankAccounts();
      if ((banks.bank_accounts ?? []).length === 0) {
        setError(
          "Add your bank details to proceed — link a bank account below before adding funds to your wallet.",
        );
        setSubmitting(false);
        return;
      }
    } catch {
      // Can't verify (transient) — proceed rather than wrongly block.
    }
    try {
      const r = await startWalletTopup(amountPaise);

      if (r.mode === "dev-pass-through") {
        // Backend already credited the wallet — show success + refresh parent.
        setSuccess(`Topped up ${formatINR(amountPaise / 100)} (dev mode — instant credit, no payment gateway hit).`);
        setAmount("");
        onCredited?.();
        return;
      }

      // Live mode — open Razorpay Checkout.
      if (!r.razorpay) {
        setError("Razorpay returned no order details.");
        return;
      }
      const intentId = r.intent_id;
      await openRazorpayCheckout({
        keyId: r.razorpay.key_id!,
        orderId: r.razorpay.order_id,
        amount: r.razorpay.amount,
        onSuccess: async (payload) => {
          // Storefront-driven verify path. Calling verify directly
          // (rather than waiting on the Razorpay webhook) means the
          // wallet credit lands in seconds, not minutes — and works
          // even in dev where the webhook URL isn't reachable.
          try {
            const v = await verifyWalletTopup({
              razorpay_order_id: payload.razorpay_order_id,
              razorpay_payment_id: payload.razorpay_payment_id,
              razorpay_signature: payload.razorpay_signature,
              intent_id: intentId,
            });
            if (v.verified && v.transaction) {
              setSuccess(
                `Topped up ${formatINR(amountPaise / 100)} — wallet credited.`,
              );
              setAmount("");
              onCredited?.();
            } else if (v.verified) {
              setSuccess(
                "Payment captured — wallet will credit within a few seconds.",
              );
              setAmount("");
              onCredited?.();
            } else {
              setError(
                "Razorpay reported success but we couldn't confirm the credit. Contact support if it doesn't appear in a minute.",
              );
            }
          } catch (err) {
            setError(
              (err as Error).message ??
                "Payment captured but verify failed. Refresh in a moment.",
            );
          }
        },
        onDismiss: () => {
          setError("Payment was cancelled.");
        },
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-8 rounded-lg border border-feedback-success-border bg-feedback-success-bg/30 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-feedback-success-bg text-feedback-success-text">
            <Zap className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-heading-sm text-text-primary">
              Instant top-up via UPI / Card
            </p>
            <p className="mt-0.5 text-caption text-text-muted">
              Pay now, balance updates within seconds. No manual approval.
            </p>
          </div>
        </div>
        <Badge tone="success" size="xs">
          Recommended
        </Badge>
      </header>

      <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <Label size="caption">Amount (₹)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            placeholder="500"
            min={1}
            required
            className="font-mono numerics-tabular"
          />
        </div>
        <Button
          type="submit"
          className="self-end"
          isLoading={submitting}
          disabled={!amountOk}
        >
          Pay {amount ? formatINR(Math.round(Number(amount))) : ""}
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {[100, 500, 1000, 5000, 10_000].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setAmount(String(q))}
            className="rounded-md border border-border-subtle bg-surface-raised px-3 py-1 text-caption text-text-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-text-primary"
          >
            ₹{q.toLocaleString("en-IN")}
          </button>
        ))}
      </div>

      {success && (
        <p className="mt-3 rounded-md bg-feedback-success-bg px-3 py-2 text-caption text-feedback-success-text">
          {success}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md bg-feedback-danger-bg px-3 py-2 text-caption text-feedback-danger-text">
          {error}
        </p>
      )}
    </section>
  );
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/** Dynamically load Razorpay Checkout JS and open it. */
async function openRazorpayCheckout({
  keyId,
  orderId,
  amount,
  onSuccess,
  onDismiss,
}: {
  keyId: string;
  orderId: string;
  amount: number;
  onSuccess: (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  onDismiss: () => void;
}) {
  await loadScript("https://checkout.razorpay.com/v1/checkout.js");
  if (typeof window === "undefined" || !window.Razorpay) {
    throw new Error("Razorpay Checkout failed to load");
  }
  const rzp = new window.Razorpay({
    key: keyId,
    order_id: orderId,
    amount,
    currency: "INR",
    name: "RISITEX",
    description: "Wallet top-up",
    handler: (payload: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => onSuccess(payload),
    modal: { ondismiss: () => onDismiss() },
    theme: { color: "#2A3F7A" },
  });
  rzp.open();
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}
