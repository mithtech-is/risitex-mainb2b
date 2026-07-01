"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { CheckCircle2 } from "lucide-react";

export default function CheckoutSuccessPage() {
  const params = useSearchParams();
  const poId = params?.get("po") ?? "";
  const poNumber = params?.get("num") ?? "";
  const amt = Number(params?.get("amt") ?? 0);
  const pay = params?.get("pay") ?? "";

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Order Received"
        subtitle="Your order is in. Confirmation + dispatch updates follow on email and WhatsApp."
      />

      <section className="flex flex-col gap-6 rounded-md border border-feedback-success-border bg-feedback-success-bg p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <CheckCircle2 className="mt-1 h-8 w-8 text-feedback-success-text shrink-0" aria-hidden />
          <div className="space-y-3">
            <h2 className="font-display text-heading-lg text-feedback-success-text">
              Thank you for placing your order.
            </h2>
            <p className="text-body-md text-feedback-success-text leading-relaxed">
              Your order has been received successfully. It is currently waiting for approval by the RISITEX sales team. Approval usually takes 5–6 minutes during business hours. You will receive a notification once your order is approved.
            </p>
          </div>
        </div>

        <div className="border-t border-feedback-success-border/30 pt-6">
          <dl className="grid grid-cols-1 gap-6 text-body-sm sm:grid-cols-3">
            <Field label="Order Number" value={poNumber || "—"} />
            <Field
              label="Estimated Total"
              value={amt > 0 ? `₹${amt.toLocaleString("en-IN")}` : "—"}
            />
            <Field
              label="Payment Method"
              value={prettyPayment(pay)}
            />
          </dl>
        </div>
      </section>

      <section className="rounded-md border border-border-subtle bg-surface-raised p-6 space-y-4">
        <h2 className="text-heading-sm text-text-primary font-display">Next steps</h2>
        <p className="text-body-sm text-text-muted leading-relaxed">
          While our team reviews and approves your order, you can manage your B2B account or browse products. Shipment tracking and invoices will become downloadable in their respective tabs as soon as approval is completed.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild>
            <Link href="/b2b/orders">View B2B Orders</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/b2b/shipments">Track Shipments</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/b2b/invoices">Download Invoices</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/wholesale/catalogue">Continue Shopping</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-feedback-success-text/80 font-medium uppercase tracking-wider">{label}</dt>
      <dd className="mt-1 text-heading-sm text-feedback-success-text font-mono font-bold">
        {value}
      </dd>
    </div>
  );
}

function prettyPayment(id: string): string {
  switch (id) {
    case "wallet":
      return "Wallet (Auto-Debit)";
    case "wallet_plus_razorpay":
      return "Wallet + Razorpay";
    case "razorpay":
      return "Razorpay (Online Payment)";
    default:
      return id || "—";
  }
}
