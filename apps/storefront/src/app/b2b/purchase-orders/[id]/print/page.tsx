"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { formatINR } from "@risitex/ui/components";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import type { DraftPurchaseOrder } from "@/lib/purchase-orders";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "x-publishable-api-key": PUB_KEY };
  if (typeof window !== "undefined") {
    const t = window.localStorage.getItem("medusa_auth_token");
    if (t) h.Authorization = `Bearer ${t}`;
  }
  return h;
}

type CompanyContext = {
  customer?: {
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
  };
  b2b?: {
    company?: {
      trade_name?: string | null;
      gstin?: string | null;
      billing_address?: {
        line1?: string;
        city?: string;
        state?: string;
        postal_code?: string;
      } | null;
    };
  } | null;
};

export default function PrintablePurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [po, setPo] = React.useState<DraftPurchaseOrder | null>(null);
  const [ctx, setCtx] = React.useState<CompanyContext | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [poRes, ctxRes] = await Promise.all([
          fetch(`${MEDUSA_BASE_URL}/store/purchase-orders`, {
            headers: authHeaders(),
            credentials: "include",
          }),
          fetch(`${MEDUSA_BASE_URL}/store/companies/me`, {
            headers: authHeaders(),
            credentials: "include",
          }),
        ]);
        if (!poRes.ok) throw new Error(`PO load failed (${poRes.status})`);
        const body = (await poRes.json()) as { purchase_orders?: DraftPurchaseOrder[] };
        const match = body.purchase_orders?.find((p) => p.id === id) ?? null;
        if (!match) throw new Error("PO not found");
        const c = ctxRes.ok ? ((await ctxRes.json()) as CompanyContext) : null;
        if (cancelled) return;
        setPo(match);
        setCtx(c);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Could not load PO");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (err) {
    return (
      <main className="mx-auto max-w-2xl p-10 text-center">
        <p className="text-lg text-red-600">{err}</p>
      </main>
    );
  }
  if (!po) {
    return (
      <main className="mx-auto max-w-2xl p-10 text-center">
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  }

  const company = ctx?.b2b?.company;
  const customer = ctx?.customer;
  const customerName =
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") ||
    customer?.email ||
    "—";
  const noteLines = String(
    (po.metadata?.notes as string | undefined) ?? "",
  ).split("\n");
  const placedAt = new Date(po.created_at).toLocaleString("en-IN");
  const paymentConfirmedAt = po.payment_confirmed_at
    ? new Date(po.payment_confirmed_at).toLocaleString("en-IN")
    : null;

  return (
    <main className="mx-auto max-w-4xl bg-white p-10 text-gray-900 print:p-0">
      <style>{`
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 18mm; }
        }
      `}</style>

      <div className="no-print mb-6 flex justify-between gap-3">
        <a href={`/b2b/purchase-orders/${po.id}`} className="text-sm text-blue-600 underline">
          ← Back to PO detail
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Print / Save as PDF
        </button>
      </div>

      <header className="mb-8 flex items-start justify-between border-b border-gray-300 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">PURCHASE ORDER</h1>
          <p className="mt-1 font-mono text-base text-gray-700">{po.po_number}</p>
          <p className="mt-1 text-sm text-gray-500">Placed: {placedAt}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">RISITEX</p>
          <p className="mt-1 text-xs text-gray-500">B2B textile manufacturing</p>
          <p className="text-xs text-gray-500">Tiruppur, Tamil Nadu, India</p>
        </div>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Buyer
          </h2>
          <p className="text-base font-medium text-gray-900">
            {company?.trade_name ?? "—"}
          </p>
          <p className="text-sm text-gray-700">
            {company?.billing_address?.line1 ?? "—"}
            <br />
            {company?.billing_address?.city ?? ""},{" "}
            {company?.billing_address?.state ?? ""}{" "}
            {company?.billing_address?.postal_code ?? ""}
          </p>
          <p className="mt-2 text-sm text-gray-700">
            GSTIN: <span className="font-mono">{company?.gstin ?? "—"}</span>
          </p>
          <p className="mt-1 text-sm text-gray-700">
            Contact: {customerName} {customer?.phone ? `· ${customer.phone}` : ""}
          </p>
        </div>
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            PO summary
          </h2>
          <dl className="space-y-1 text-sm text-gray-700">
            <Row label="PO Number" value={po.po_number} mono />
            <Row label="Internal ID" value={po.id} mono />
            <Row label="Total value" value={formatINR(po.value_major)} />
            {po.expected_payment_date && (
              <Row
                label="Expected payment"
                value={new Date(po.expected_payment_date).toLocaleDateString("en-IN")}
              />
            )}
            <Row
              label="Status"
              value={
                po.order
                  ? "Order confirmed"
                  : po.payment_confirmed_at
                    ? "Payment recorded (awaiting approval)"
                    : "Awaiting payment"
              }
            />
          </dl>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
          Order breakdown
        </h2>
        <pre className="rounded border border-gray-200 bg-gray-50 p-4 text-sm whitespace-pre-wrap text-gray-800">
          {noteLines.join("\n") || "No additional notes."}
        </pre>
      </section>

      {paymentConfirmedAt && (
        <section className="mb-8 rounded border border-green-300 bg-green-50 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-green-800">
            Payment proof recorded
          </h2>
          <dl className="grid grid-cols-3 gap-3 text-sm text-green-900">
            <Row label="Method" value={po.payment_confirmed_method ?? "—"} />
            <Row label="Reference" value={po.payment_confirmed_reference ?? "—"} mono />
            <Row label="Confirmed at" value={paymentConfirmedAt} />
          </dl>
        </section>
      )}

      <footer className="mt-12 border-t border-gray-300 pt-4 text-xs text-gray-500">
        <p>
          This is a system-generated purchase order. Approval, dispatch, and
          invoice issuance follow Risitex&apos;s B2B fulfillment workflow.
        </p>
      </footer>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={(mono ? "font-mono " : "") + "text-sm text-gray-900"}>{value}</dd>
    </div>
  );
}
