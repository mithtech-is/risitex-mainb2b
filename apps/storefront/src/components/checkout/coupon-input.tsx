"use client";

import * as React from "react";
import { Button, Input } from "@risitex/ui/components";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

export type AppliedCoupon = {
  code: string;
  discount_type: "percentage" | "fixed";
  value: number;
  discount_paise: number;
  expires_at?: string | null;
};

/**
 * Inline coupon input.
 *
 * Hits the read-only `/store/discount-code/preview` endpoint (no cart needed)
 * so the buyer sees a live discount preview while drafting their PO. The
 * authoritative apply happens later when the cart materialises — this widget
 * just stores the validated coupon and reports the discount to its parent.
 */
export function CouponInput({
  subtotalPaise,
  onChange,
}: {
  subtotalPaise: number;
  onChange?: (coupon: AppliedCoupon | null) => void;
}) {
  const [code, setCode] = React.useState("");
  const [status, setStatus] = React.useState<
    "idle" | "checking" | "applied" | "error"
  >("idle");
  const [applied, setApplied] = React.useState<AppliedCoupon | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Re-preview when the subtotal changes so the discount stays accurate as
  // the buyer adjusts the PO estimated value.
  React.useEffect(() => {
    if (status !== "applied" || !applied) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/store/discount-code/preview`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-publishable-api-key": PUB_KEY,
          },
          body: JSON.stringify({
            code: applied.code,
            subtotal_paise: subtotalPaise,
          }),
        });
        if (!res.ok) return;
        const next = (await res.json()) as AppliedCoupon & { ok: true };
        if (!cancelled) {
          setApplied(next);
          onChange?.(next);
        }
      } catch {
        /* keep prior applied state on transient failures */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotalPaise]);

  const apply = async () => {
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Enter a coupon code.");
      return;
    }
    setStatus("checking");
    try {
      const res = await fetch(`${BACKEND_URL}/store/discount-code/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUB_KEY,
        },
        body: JSON.stringify({ code: trimmed, subtotal_paise: subtotalPaise }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          reason?: string;
        };
        if (res.status === 404) {
          setError("No matching coupon found.");
        } else if (body.reason === "expired") {
          setError("This coupon has expired.");
        } else if (body.reason === "min_units") {
          setError(
            "Order quantity is below the minimum required for this coupon.",
          );
        } else if (body.reason === "inactive") {
          setError("This coupon is no longer active.");
        } else {
          setError("Could not apply coupon. Please check the code and retry.");
        }
        setStatus("error");
        setApplied(null);
        onChange?.(null);
        return;
      }
      const data = (await res.json()) as AppliedCoupon & { ok: true };
      setApplied(data);
      onChange?.(data);
      setStatus("applied");
    } catch {
      setError("Network error — please retry.");
      setStatus("error");
    }
  };

  const remove = () => {
    setApplied(null);
    setCode("");
    setStatus("idle");
    setError(null);
    onChange?.(null);
  };

  if (status === "applied" && applied) {
    const label =
      applied.discount_type === "percentage"
        ? `${applied.value}% off`
        : `Flat ₹${Math.round(applied.value / 100)} off`;
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-feedback-success-border bg-feedback-success-bg p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-body-md font-medium text-feedback-success-text">
              Coupon applied: {applied.code}
            </p>
            <p className="mt-1 text-caption text-feedback-success-text/80">
              {label} · Discount ₹
              {Math.round(applied.discount_paise / 100).toLocaleString("en-IN")}
              {applied.expires_at
                ? ` · Expires ${new Date(applied.expires_at).toLocaleDateString(
                    "en-IN",
                  )}`
                : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={remove}
          >
            Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border-subtle bg-surface-raised p-4">
      <p className="text-body-sm text-text-primary">Coupon code</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.currentTarget.value.toUpperCase())}
          placeholder="ENTER-CODE"
          className="flex-1 min-w-[180px] font-mono"
        />
        <Button
          type="button"
          onClick={apply}
          isLoading={status === "checking"}
          variant="secondary"
        >
          Apply
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-2 text-caption text-feedback-danger-text"
        >
          {error}
        </p>
      )}
    </div>
  );
}
