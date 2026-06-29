"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Label, Textarea } from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { createPurchaseOrder } from "@/lib/purchase-orders";
import { ShippingGstEstimate } from "@/components/checkout/shipping-gst-estimate";
import { CouponInput, type AppliedCoupon } from "@/components/checkout/coupon-input";

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const productName = search.get("productName") ?? search.get("product") ?? "";
  const quantity = search.get("quantity") ?? search.get("qty") ?? "";
  const variants = search.getAll("variant").map((entry) => {
    const [variantId, qty] = entry.split(":");
    return {
      variantId: variantId ?? "",
      quantity: Math.max(0, Number(qty ?? 0)),
    };
  }).filter((line) => line.variantId && line.quantity > 0);
  const variantQuantity = variants.reduce((sum, line) => sum + line.quantity, 0);
  const estimatedValue = Math.max(
    1,
    Number(search.get("value") ?? search.get("total") ?? 1),
  );
  const [currentValueMajor, setCurrentValueMajor] = React.useState(estimatedValue);
  const [coupon, setCoupon] = React.useState<AppliedCoupon | null>(null);
  const discountedSubtotalPaise = Math.max(
    0,
    Math.round(currentValueMajor * 100) - (coupon?.discount_paise ?? 0),
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const fd = new FormData(event.currentTarget);
    try {
      const created = await createPurchaseOrder({
        po_number: String(fd.get("po_number") ?? "").trim(),
        value_major: Number(fd.get("value_major") ?? estimatedValue),
        expected_payment_date: String(fd.get("expected_payment_date") || "")
          ? new Date(String(fd.get("expected_payment_date"))).toISOString()
          : undefined,
        notes: String(fd.get("notes") ?? "").trim() || undefined,
        file_url: "/generated/b2b-purchase-order-draft.pdf",
      });
      router.push(`/b2b/purchase-orders?created=${created.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create purchase order",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="New Purchase Order"
        subtitle="Create a draft PO from a reorder, matrix grid, or product page"
      />
      <form
        onSubmit={submit}
        className="grid grid-cols-1 gap-5 rounded-md border border-border-subtle bg-surface-raised p-6 md:grid-cols-2"
      >
        {(productName || variants.length > 0) && (
          <div className="md:col-span-2 rounded-md bg-surface-sunken p-4">
            <p className="text-micro text-text-muted">Draft source</p>
            <p className="mt-1 text-body-md text-text-primary">
              {productName || "Selected variants"}
              {quantity || variantQuantity
                ? ` - ${quantity || variantQuantity} pcs`
                : ""}
            </p>
            {variants.length > 0 && (
              <ul className="mt-3 grid grid-cols-1 gap-2 text-caption text-text-muted md:grid-cols-2">
                {variants.slice(0, 8).map((line) => (
                  <li key={line.variantId} className="font-mono">
                    {line.variantId}: {line.quantity} pcs
                  </li>
                ))}
                {variants.length > 8 && (
                  <li>{variants.length - 8} more variant lines</li>
                )}
              </ul>
            )}
          </div>
        )}
        <Field label="PO number" required>
          <Input
            name="po_number"
            required
            defaultValue={`PO-${new Date().getFullYear()}-${Date.now()
              .toString()
              .slice(-6)}`}
          />
        </Field>
        <Field label="Estimated value" required>
          <Input
            name="value_major"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={String(estimatedValue)}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              if (Number.isFinite(v) && v > 0) setCurrentValueMajor(v);
            }}
          />
        </Field>
        <Field label="Expected payment date">
          <Input name="expected_payment_date" type="date" />
        </Field>
        <Field label="Notes" className="md:col-span-2">
          <Textarea
            name="notes"
            rows={4}
            defaultValue={
              productName
                ? `Draft generated from ${productName}${quantity ? `, ${quantity} pcs` : ""}.`
                : ""
            }
          />
        </Field>
        {error && (
          <p className="md:col-span-2 rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border">
            {error}
          </p>
        )}
        <div className="md:col-span-2">
          <CouponInput
            subtotalPaise={Math.round(currentValueMajor * 100)}
            onChange={setCoupon}
          />
        </div>
        <div className="md:col-span-2">
          <ShippingGstEstimate subtotalPaise={discountedSubtotalPaise} />
        </div>
        <div className="md:col-span-2 flex flex-wrap gap-3">
          <Button type="submit" isLoading={submitting}>
            Save draft PO
          </Button>
          <Button asChild variant="secondary">
            <Link href="/b2b/purchase-orders">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label required={required}>{label}</Label>
      {children}
    </div>
  );
}
