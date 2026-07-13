"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
  formatINR,
} from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { type DraftPurchaseOrder } from "@/lib/purchase-orders";
import { downloadOrderInvoice } from "@/lib/invoice";
import {
  CheckCircle2,
  Download,
  FileText,
  Package,
  Receipt,
  Truck,
} from "lucide-react";

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "x-publishable-api-key": PUB_KEY };
  if (typeof window !== "undefined") {
    const t = window.localStorage.getItem("medusa_auth_token");
    if (t) h.Authorization = `Bearer ${t}`;
  }
  return h;
}

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const _router = useRouter();

  const [po, setPo] = React.useState<DraftPurchaseOrder | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = React.useState(false);

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      // Resolve the focused PO from the list endpoint ΓÇö the underlying
      // /store/purchase-orders/:id only handles PATCH, not GET, so we filter
      // the buyer's full list to find this row. With a typical PO inventory
      // size (<200 per buyer) this is faster than a separate detail roundtrip.
      const res = await fetch(`${MEDUSA_BASE_URL}/store/purchase-orders`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(
          res.status === 401 ? "Sign in to view this PO." : `Load failed (${res.status})`,
        );
      }
      const body = (await res.json()) as { purchase_orders?: DraftPurchaseOrder[] };
      const match = body.purchase_orders?.find((p) => p.id === id) ?? null;
      if (!match) {
        setError("This purchase order doesn't belong to your account, or it was removed.");
      } else {
        setPo(match);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load PO");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Re-poll so the buyer sees the status flip to the green "approved /
  // dispatched" state moments after the admin acts — without a manual reload.
  React.useEffect(() => {
    const refresh = () => void load({ silent: true });
    const interval = window.setInterval(refresh, 20_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Purchase order" subtitle="" />
        <p role="status" aria-live="polite" className="text-body-sm text-text-muted">
          LoadingΓÇª
        </p>
      </div>
    );
  }

  if (error || !po) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Purchase order" subtitle="" />
        <EmptyState
          title="PO not found"
          description={error ?? "We couldn't find that PO."}
          action={
            <Button asChild>
              <Link href="/b2b/orders">All orders</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const linkedToOrder = !!po.order;
  const adminApproved = !!po.admin_approved_at || linkedToOrder;
  const dispatched = !!po.dispatched_at || po.status === "fulfilled";
  const snapshotNotes =
    (po.metadata?.notes as string | undefined) ??
    (po.metadata?.payment_confirmed_notes as string | undefined) ??
    "";

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title={po.po_number}
        subtitle={`Purchase order · ${new Date(po.created_at).toLocaleString("en-IN")}`}
      />

      {/* Top-level status banner — always green. The buyer never handles
          payment; the flow is placed → (admin approves) → confirmed →
          dispatched. */}
      <section className="rounded-md border border-feedback-success-border bg-feedback-success-bg p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-heading-sm text-feedback-success-text">
              {dispatched
                ? "Order dispatched — in transit"
                : adminApproved
                  ? "Order confirmed and will be dispatched soon"
                  : "Order placed — confirmation in progress"}
            </p>
            <p className="mt-1 text-body-sm text-feedback-success-text/80">
              {dispatched
                ? `Your order has been dispatched${po.dispatch_carrier ? ` via ${po.dispatch_carrier}` : ""}${po.dispatch_tracking_number ? ` (tracking: ${po.dispatch_tracking_number})` : ""}.`
                : adminApproved
                  ? "Your order is confirmed and will be dispatched soon. You can download the GST invoice below."
                  : "Thanks! Your order has been placed. Our team will confirm it in 2–6 minutes — we'll get back to you shortly. No action needed from your side."}
            </p>
          </div>
          <Badge tone="success">
            {dispatched ? "dispatched" : adminApproved ? "confirmed" : "placed"}
          </Badge>
        </div>
      </section>

      {dispatched && po.dispatch_tracking_number && (
        <section className="rounded-md border border-feedback-success-border bg-feedback-success-bg p-5">
          <div className="flex items-start gap-3">
            <Truck className="mt-0.5 h-5 w-5 text-feedback-success-text" aria-hidden />
            <div className="flex-1">
              <p className="text-body-md font-medium text-feedback-success-text">
                Tracking information
              </p>
              <dl className="mt-2 grid grid-cols-1 gap-2 text-caption text-feedback-success-text/80 sm:grid-cols-3">
                <div>
                  <dt className="opacity-70">Carrier</dt>
                  <dd className="text-body-sm text-feedback-success-text">
                    {po.dispatch_carrier ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="opacity-70">Tracking number</dt>
                  <dd className="font-mono text-body-sm text-feedback-success-text">
                    {po.dispatch_tracking_number}
                  </dd>
                </div>
                {po.dispatched_at && (
                  <div>
                    <dt className="opacity-70">Dispatched at</dt>
                    <dd className="text-body-sm text-feedback-success-text">
                      {new Date(po.dispatched_at).toLocaleString("en-IN")}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Snapshot */}
        <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
          <h2 className="text-heading-sm text-text-primary">PO snapshot</h2>
          <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="PO Number" value={po.po_number} mono />
            <Field label="Internal ID" value={po.id} mono />
            <Field label="Value" value={formatINR(po.value_major)} />
            <Field
              label="Placed"
              value={new Date(po.created_at).toLocaleString("en-IN")}
            />
            {po.expected_payment_date && (
              <Field
                label="Expected payment"
                value={new Date(po.expected_payment_date).toLocaleDateString("en-IN")}
              />
            )}
            <Field
              label="Linked order"
              value={
                po.order
                  ? `RST-${String(po.order.display_id).padStart(6, "0")}`
                  : "Not yet linked"
              }
            />
            {adminApproved && (
              <Field
                label="Approved by"
                value={po.admin_approved_by_name ?? "Admin"}
              />
            )}
          </dl>

          {snapshotNotes && (
            <div className="mt-5">
              <p className="text-caption text-text-muted">Order notes</p>
              <pre className="mt-2 whitespace-pre-wrap rounded-sm border border-border-subtle bg-surface-background p-3 text-caption text-text-secondary">
                {snapshotNotes}
              </pre>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {(linkedToOrder || adminApproved) && (
              <Button
                variant="secondary"
                size="sm"
                isLoading={invoiceBusy}
                onClick={async () => {
                  setInvoiceBusy(true);
                  try {
                    // Prefer the linked Medusa order id; fall back to the PO id
                    // (the backend invoice route resolves either).
                    await downloadOrderInvoice(
                      po.order?.id ?? po.id,
                      po.order?.display_id ?? po.po_number,
                    );
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "Invoice download failed");
                  } finally {
                    setInvoiceBusy(false);
                  }
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Download invoice
              </Button>
            )}
          </div>
        </section>

        {/* Right column: read-only status — the buyer never confirms payment;
            the admin approves the order from the backend. */}
        <aside aria-label="Order status" className="space-y-4">
          <OrderStatusCard adminApproved={adminApproved} dispatched={dispatched} />
          <WorkflowCard po={po} />
        </aside>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button asChild variant="secondary">
          <Link href="/b2b/orders">All orders</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/wholesale/catalogue">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className={(mono ? "font-mono " : "") + "mt-1 text-body-sm text-text-primary"}>
        {value}
      </dd>
    </div>
  );
}

function OrderStatusCard({
  adminApproved,
  dispatched,
}: {
  adminApproved: boolean;
  dispatched: boolean;
}) {
  const confirmed = adminApproved || dispatched;
  return (
    <section className="rounded-md border border-feedback-success-border bg-feedback-success-bg p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2
          className="mt-0.5 h-5 w-5 text-feedback-success-text"
          aria-hidden
        />
        <div>
          <p className="text-body-md font-medium text-feedback-success-text">
            {confirmed ? "Order confirmed" : "Order placed"}
          </p>
          <p className="mt-1 text-caption text-feedback-success-text/80">
            {dispatched
              ? "Your order is on its way."
              : confirmed
                ? "Your order has been confirmed by our team and will be dispatched soon."
                : "We've received your order. Our team confirms it in 2–6 minutes — no payment action is needed from you; we'll take it from here."}
          </p>
        </div>
      </div>
    </section>
  );
}

function WorkflowCard({ po }: { po: DraftPurchaseOrder }) {
  const paymentConfirmed = !!po.payment_confirmed_at;
  const adminApproved = !!po.admin_approved_at;
  const linkedToOrder = !!po.order;
  const dispatched = !!po.dispatched_at || po.status === "fulfilled";
  return (
    <section className="rounded-md border border-border-subtle bg-surface-raised p-5">
      <h3 className="text-heading-sm text-text-primary">Workflow</h3>
      <ul className="mt-3 space-y-3 text-body-sm">
        <Step
          icon={<FileText className="h-4 w-4" />}
          label="PO drafted"
          done
          ts={po.created_at}
        />
        <Step
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Payment recorded"
          done={paymentConfirmed}
          ts={po.payment_confirmed_at ?? null}
        />
        <Step
          icon={<Receipt className="h-4 w-4" />}
          label="Admin approved"
          done={adminApproved}
          ts={po.admin_approved_at ?? null}
        />
        <Step
          icon={<Package className="h-4 w-4" />}
          label="Order confirmed"
          done={linkedToOrder || adminApproved}
        />
        <Step
          icon={<Truck className="h-4 w-4" />}
          label="Shipment dispatched"
          done={dispatched}
          ts={po.dispatched_at ?? null}
        />
      </ul>
    </section>
  );
}

function Step({
  icon,
  label,
  done,
  ts,
}: {
  icon: React.ReactNode;
  label: string;
  done: boolean;
  ts?: string | null;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={
          (done
            ? "bg-feedback-success-bg text-feedback-success-text ring-1 ring-feedback-success-border"
            : "bg-surface-sunken text-text-muted") +
          " mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        }
        aria-hidden
      >
        {icon}
      </span>
      <div>
        <p
          className={
            (done ? "text-text-primary" : "text-text-muted") + " text-body-sm"
          }
        >
          {label}
        </p>
        {ts && done && (
          <p className="mt-0.5 text-caption text-text-muted">
            {new Date(ts).toLocaleString("en-IN")}
          </p>
        )}
      </div>
    </li>
  );
}
