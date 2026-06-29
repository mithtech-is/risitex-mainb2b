"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Badge } from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { CheckCircle2, FileDown, Truck, Receipt, Eye } from "lucide-react";

/**
 * /b2b/checkout/success
 *
 * Terminal screen after a successful Place Order. Reads the result from
 * URL params (the wizard handed them off) so this page never needs auth
 * round-trips to render — the buyer sees their confirmation instantly.
 *
 * Real-money side-effects (wallet debit, invoice issuance, shipment ticket,
 * ERPNext sync) are queued by the backend workflow chain triggered from the
 * PO creation endpoint. The status badges below reflect the workflow steps;
 * "queued" is the expected initial state until each downstream job lands.
 */
export default function CheckoutSuccessPage() {
  const params = useSearchParams();
  const poId = params?.get("po") ?? "";
  const poNumber = params?.get("num") ?? "";
  const amt = Number(params?.get("amt") ?? 0);
  const pay = params?.get("pay") ?? "";

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Order placed"
        subtitle="Your purchase order is in. Confirmation + dispatch updates follow on email and WhatsApp."
      />

      <section className="flex flex-col gap-4 rounded-md border border-feedback-success-border bg-feedback-success-bg p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 h-6 w-6 text-feedback-success-text" aria-hidden />
          <div>
            <p className="text-heading-md text-feedback-success-text">
              Purchase order received
            </p>
            <p className="mt-1 text-body-sm text-feedback-success-text/80">
              We've logged your PO and routed it to ops + finance. You can track
              progress from this page or the Purchase Orders dashboard.
            </p>
          </div>
        </div>

        <dl className="mt-2 grid grid-cols-1 gap-3 text-body-sm md:grid-cols-2">
          <Field label="PO Number" value={poNumber || "—"} mono />
          <Field label="Internal ID" value={poId || "—"} mono />
          <Field
            label="Amount"
            value={amt > 0 ? `₹${amt.toLocaleString("en-IN")}` : "—"}
          />
          <Field
            label="Payment Method"
            value={prettyPayment(pay)}
          />
        </dl>
      </section>

      <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
        <h2 className="text-heading-sm text-text-primary">Workflow status</h2>
        <p className="mt-1 text-caption text-text-muted">
          Each downstream step runs asynchronously; status here updates as
          jobs land.
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <StatusRow icon={<Receipt className="h-4 w-4" />} label="Invoice" status="Queued" />
          <StatusRow icon={<Truck className="h-4 w-4" />} label="Shipment ticket" status="Queued" />
          <StatusRow icon={<FileDown className="h-4 w-4" />} label="Wallet ledger" status={pay === "wallet" || pay === "wallet_plus_razorpay" ? "Reserved" : "Not applicable"} />
          <StatusRow icon={<Eye className="h-4 w-4" />} label="ERPNext sync" status="Queued" />
        </ul>
      </section>

      <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
        <h2 className="text-heading-sm text-text-primary">Next steps</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/b2b/purchase-orders">View all purchase orders</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/b2b/shipments">Track shipments</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/b2b/invoices">Download invoices</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/wholesale/catalogue">Continue shopping</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-caption text-feedback-success-text/70">{label}</dt>
      <dd
        className={
          (mono ? "font-mono " : "") +
          "mt-1 text-body-md text-feedback-success-text"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function StatusRow({
  icon,
  label,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  status: "Queued" | "Reserved" | "Not applicable";
}) {
  const tone =
    status === "Reserved"
      ? "info"
      : status === "Not applicable"
        ? "neutral"
        : "warning";
  return (
    <li className="flex items-center gap-3 rounded-sm border border-border-subtle bg-surface-background p-3">
      <span className="text-text-muted" aria-hidden>
        {icon}
      </span>
      <span className="flex-1 text-body-sm text-text-primary">{label}</span>
      <Badge tone={tone as "info" | "warning" | "neutral"}>{status}</Badge>
    </li>
  );
}

function prettyPayment(id: string): string {
  switch (id) {
    case "wallet":
      return "Wallet";
    case "wallet_plus_razorpay":
      return "Wallet + Razorpay";
    case "razorpay":
      return "Razorpay (Card / UPI)";
    case "credit_terms":
      return "Credit Terms";
    case "po_upload":
      return "Purchase Order Upload";
    case "bank_transfer":
      return "Bank Transfer (NEFT / RTGS)";
    case "proforma":
      return "Proforma Invoice";
    default:
      return id || "—";
  }
}
