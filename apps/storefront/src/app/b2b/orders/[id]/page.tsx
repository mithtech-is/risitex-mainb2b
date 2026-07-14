"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  CreditCard,
  Download,
  FileText,
  PackageCheck,
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

type NativeOrder = {
  id: string;
  display_id: number | string;
  status?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  created_at: string;
  total?: number | null;
};

/**
 * Last-resort resolver: the id is a native Medusa order that has no linked
 * purchase order (rare — buyer checkouts always mint a PO, but admin- or
 * reorder-created orders may not). Adapt it into the PO shape the page renders
 * so the buyer still gets a live status view instead of a dead "not found".
 * Milestone timestamps are unknown here; the tracker infers reached stages
 * from the native payment/fulfilment status instead.
 */
async function loadOrderAsPo(id: string): Promise<DraftPurchaseOrder | null> {
  try {
    const r = await fetch(
      `${MEDUSA_BASE_URL}/store/orders/${encodeURIComponent(id)}?fields=id,display_id,status,payment_status,fulfillment_status,created_at,total`,
      { headers: authHeaders(), credentials: "include" },
    );
    if (!r.ok) return null;
    const { order } = (await r.json()) as { order?: NativeOrder };
    if (!order) return null;
    return {
      id: order.id,
      po_number: `RST-${String(order.display_id).padStart(6, "0")}`,
      file_url: null,
      value_major: Number(order.total ?? 0),
      expected_payment_date: null,
      created_at: order.created_at,
      status:
        (order.fulfillment_status ?? "").toLowerCase() === "delivered"
          ? "fulfilled"
          : "in_progress",
      order: {
        id: order.id,
        display_id: order.display_id,
        status: order.status,
        payment_status: order.payment_status,
        fulfillment_status: order.fulfillment_status,
      },
      metadata: null,
    } as DraftPurchaseOrder;
  } catch {
    return null;
  }
}

// ── Lifecycle derivation ──────────────────────────────────────────────
// The buyer's order moves through a strictly sequential pipeline. We read the
// milestone flags off the PO (stamped by the backend) AND off its linked native
// order (payment / fulfilment status), so the status is correct whether the row
// came in as a PO or as a promoted order.
type Lifecycle = {
  paid: boolean;
  paidAt: string | null;
  payMethod: string | null;
  approved: boolean;
  dispatched: boolean;
  delivered: boolean;
};

const PAID_STATES = new Set(["captured", "paid", "partially_refunded"]);
const SHIPPED_STATES = new Set([
  "shipped",
  "partially_shipped",
  "fulfilled",
  "partially_fulfilled",
  "delivered",
]);

function metaStr(po: DraftPurchaseOrder, key: string): string | null {
  const v = (po.metadata ?? {})[key];
  return typeof v === "string" && v ? v : null;
}

function deriveLifecycle(po: DraftPurchaseOrder): Lifecycle {
  const ps = (po.order?.payment_status ?? "").toLowerCase();
  const ff = (po.order?.fulfillment_status ?? "").toLowerCase();
  // A payment made at checkout (manual-UPI / Razorpay) is stamped on metadata
  // as payment_captured_at (buyer paid) → payment_verified_at (admin verified);
  // the separate confirm-payment flow sets payment_confirmed_at. Treat any of
  // them — or a captured native order — as "paid", so the buyer sees the Paid
  // tick the moment they pay, not only once the order is approved.
  const paidAt =
    po.payment_confirmed_at ||
    metaStr(po, "payment_verified_at") ||
    metaStr(po, "payment_captured_at") ||
    null;
  const paid = !!paidAt || PAID_STATES.has(ps);
  const payMethod = po.payment_confirmed_method || metaStr(po, "payment_method");
  const approved = !!po.admin_approved_at;
  const dispatched =
    !!po.dispatched_at || po.status === "fulfilled" || SHIPPED_STATES.has(ff);
  const delivered = ff === "delivered";
  return { paid, paidAt, payMethod, approved, dispatched, delivered };
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [po, setPo] = React.useState<DraftPurchaseOrder | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = React.useState(false);

  const load = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        // /store/purchase-orders/:id only handles PATCH, so we pull the buyer's
        // full PO list and resolve locally. The incoming id can be EITHER a PO
        // id (an orphan PO row) OR a native order id (a PO promoted to an order
        // surfaces its order id in the history table) — match both so "View"
        // never dead-ends.
        const res = await fetch(`${MEDUSA_BASE_URL}/store/purchase-orders`, {
          headers: authHeaders(),
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(
            res.status === 401
              ? "Sign in to view this order."
              : `Load failed (${res.status})`,
          );
        }
        const body = (await res.json()) as {
          purchase_orders?: DraftPurchaseOrder[];
        };
        const list = body.purchase_orders ?? [];
        const match =
          list.find((p) => p.id === id) ??
          list.find((p) => p.order?.id === id) ??
          null;
        if (match) {
          setPo(match);
          return;
        }
        // No PO carries this id — try it as a standalone native order.
        const adapted = await loadOrderAsPo(id);
        if (adapted) {
          setPo(adapted);
          return;
        }
        setError(
          "This order doesn't belong to your account, or it was removed.",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load this order");
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  // Re-poll so the buyer watches the status advance (approved → dispatched)
  // moments after the admin acts, without a manual reload.
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
        <B2bTopbar title="Order" subtitle="" />
        <div className="animate-pulse rounded-2xl border border-border-subtle bg-surface-raised p-6">
          <div className="h-4 w-40 rounded-full bg-surface-sunken" />
          <div className="mt-4 h-10 w-full rounded-full bg-surface-sunken" />
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          Loading order…
        </p>
      </div>
    );
  }

  if (error || !po) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Order" subtitle="" />
        <EmptyState
          title="Order not found"
          description={error ?? "We couldn't find that order."}
          action={
            <Button asChild>
              <Link href="/b2b/orders">All orders</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { paid, paidAt, payMethod, approved, dispatched, delivered } =
    deriveLifecycle(po);

  const shortDate = (x?: string | null) =>
    x
      ? new Date(x).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      : null;

  const stages: TrackStage[] = [
    {
      key: "placed",
      label: "Placed",
      icon: <FileText className="h-5 w-5" aria-hidden />,
      done: true,
      date: shortDate(po.created_at),
    },
    {
      key: "paid",
      label: "Paid",
      icon: <CreditCard className="h-5 w-5" aria-hidden />,
      done: paid,
      date: shortDate(paidAt),
    },
    {
      key: "approved",
      label: "Approved",
      icon: <CheckCircle2 className="h-5 w-5" aria-hidden />,
      done: approved,
      date: shortDate(po.admin_approved_at),
    },
    {
      key: "dispatched",
      label: "Dispatched",
      icon: <Truck className="h-5 w-5" aria-hidden />,
      done: dispatched,
      date: shortDate(po.dispatched_at),
    },
    {
      key: "delivered",
      label: "Delivered",
      icon: <PackageCheck className="h-5 w-5" aria-hidden />,
      done: delivered,
      date: null,
    },
  ];

  const headline = delivered
    ? "Delivered"
    : dispatched
      ? "Out for delivery"
      : approved
        ? "Order confirmed"
        : paid
          ? "Payment received — awaiting approval"
          : "Order placed";
  const subline = delivered
    ? "Your order has been delivered. Thank you!"
    : dispatched
      ? `Your order is in transit${po.dispatch_carrier ? ` via ${po.dispatch_carrier}` : ""}. Track it below.`
      : approved
        ? "Confirmed by our team and dispatching soon — your GST invoice is ready below."
        : paid
          ? "We've received your payment. Our team approves the order in 2–6 minutes."
          : "Order received. Our team confirms it in 2–6 minutes — no action needed from your side.";
  const badgeText = delivered
    ? "delivered"
    : dispatched
      ? "dispatched"
      : approved
        ? "confirmed"
        : paid
          ? "paid"
          : "placed";
  const badgeTone: "success" | "info" | "warning" =
    delivered || dispatched || approved ? "success" : paid ? "info" : "warning";

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title={po.po_number}
        subtitle={`Order · placed ${new Date(po.created_at).toLocaleString("en-IN")}`}
      />

      {/* Hero — headline status + live progress tracker */}
      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised shadow-[0_18px_40px_-24px_rgba(20,20,18,0.25)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle bg-surface-sunken px-6 py-5">
          <div>
            <p className="text-micro uppercase tracking-[0.14em] text-text-muted">
              Order status
            </p>
            <p className="mt-1 text-heading-md text-text-primary">{headline}</p>
            <p className="mt-1 max-w-[52ch] text-body-sm text-text-secondary">
              {subline}
            </p>
          </div>
          <Badge tone={badgeTone}>{badgeText}</Badge>
        </div>
        <div className="px-4 py-8 sm:px-8">
          <Tracker stages={stages} />
        </div>
      </section>

      {/* Live shipment tracking */}
      {dispatched && po.dispatch_tracking_number && (
        <section className="rounded-2xl border border-feedback-success-border bg-feedback-success-bg p-6">
          <div className="flex items-start gap-3">
            <Truck
              className="mt-0.5 h-5 w-5 text-feedback-success-text"
              aria-hidden
            />
            <div className="flex-1">
              <p className="text-body-md font-medium text-feedback-success-text">
                Shipment tracking
              </p>
              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TrackField label="Carrier" value={po.dispatch_carrier ?? "—"} />
                <TrackField
                  label="Tracking number"
                  value={po.dispatch_tracking_number}
                  mono
                />
                {po.dispatched_at && (
                  <TrackField
                    label="Dispatched"
                    value={new Date(po.dispatched_at).toLocaleString("en-IN")}
                  />
                )}
              </dl>
            </div>
          </div>
        </section>
      )}

      {/* Details + summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-border-subtle bg-surface-raised p-6">
          <h2 className="text-heading-sm text-text-primary">Order details</h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Reference" value={po.po_number} mono />
            <Field label="Order value" value={formatINR(po.value_major)} />
            <Field
              label="Placed on"
              value={new Date(po.created_at).toLocaleString("en-IN")}
            />
            <Field
              label="Linked order"
              value={
                po.order
                  ? `RST-${String(po.order.display_id).padStart(6, "0")}`
                  : "—"
              }
            />
            {payMethod && (
              <Field
                label="Payment method"
                value={payMethod.replace(/_/g, " ")}
                capitalize
              />
            )}
            {approved && (
              <Field
                label="Approved by"
                value={po.admin_approved_by_name ?? "RISITEX team"}
              />
            )}
          </dl>

          {(() => {
            const notes =
              (po.metadata?.notes as string | undefined) ??
              (po.metadata?.payment_confirmed_notes as string | undefined) ??
              "";
            return notes ? (
              <div className="mt-5">
                <p className="text-caption text-text-muted">Order notes</p>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-border-subtle bg-surface-sunken p-3 text-caption text-text-secondary">
                  {notes}
                </pre>
              </div>
            ) : null;
          })()}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-2xl border border-border-subtle bg-surface-raised p-6">
            <p className="text-micro uppercase tracking-[0.14em] text-text-muted">
              Order total
            </p>
            <p className="mt-1 font-display text-heading-lg text-text-primary numerics-tabular">
              {formatINR(po.value_major)}
            </p>
            <p className="mt-2 text-caption text-text-secondary">
              {approved
                ? "Confirmed — GST invoice available."
                : paid
                  ? "Payment received — awaiting approval."
                  : "Confirmation in progress (2–6 min)."}
            </p>
            {approved && (
              <Button
                className="mt-4 w-full"
                variant="secondary"
                isLoading={invoiceBusy}
                onClick={async () => {
                  setInvoiceBusy(true);
                  try {
                    await downloadOrderInvoice(
                      po.order?.id ?? po.id,
                      po.order?.display_id ?? po.po_number,
                    );
                  } catch (e) {
                    alert(
                      e instanceof Error ? e.message : "Invoice download failed",
                    );
                  } finally {
                    setInvoiceBusy(false);
                  }
                }}
              >
                <Download className="mr-2 h-4 w-4" aria-hidden />
                Download GST invoice
              </Button>
            )}
          </section>

          <div className="flex flex-col gap-2">
            <Button asChild variant="secondary" className="w-full">
              <Link href="/b2b/orders">All orders</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/wholesale/catalogue">Continue shopping</Link>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

type TrackStage = {
  key: string;
  label: string;
  icon: React.ReactNode;
  done: boolean;
  date: string | null;
};

/**
 * Horizontal progress tracker. The stages are strictly sequential, so we fill
 * every node up to the furthest one reached — the timeline is always a clean
 * progression (never "Approved ✓ while Paid ○"). Each step is an equal-width
 * column with its node centred and connector halves joining neighbours, so the
 * labels always sit exactly under their node.
 */
function Tracker({ stages }: { stages: TrackStage[] }) {
  const lastDone = stages.reduce(
    (acc, s, i) => (s.done ? i : acc),
    -1,
  );
  return (
    <ol className="flex items-start">
      {stages.map((s, i) => {
        const done = i <= lastDone;
        const current = i === lastDone;
        const first = i === 0;
        const last = i === stages.length - 1;
        return (
          <li
            key={s.key}
            className="flex flex-1 flex-col items-center text-center"
          >
            <div className="flex w-full items-center">
              <span
                aria-hidden
                className={`h-[2px] flex-1 rounded-full ${
                  first
                    ? "opacity-0"
                    : i <= lastDone
                      ? "bg-feedback-success-text"
                      : "bg-border-strong"
                }`}
              />
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-base ${
                  done
                    ? "bg-feedback-success-bg text-feedback-success-text ring-1 ring-feedback-success-border"
                    : "bg-surface-sunken text-text-muted ring-1 ring-border-subtle"
                } ${current ? "ring-2 ring-feedback-success-text" : ""}`}
              >
                {s.icon}
              </span>
              <span
                aria-hidden
                className={`h-[2px] flex-1 rounded-full ${
                  last
                    ? "opacity-0"
                    : i < lastDone
                      ? "bg-feedback-success-text"
                      : "bg-border-strong"
                }`}
              />
            </div>
            <span
              className={`mt-2 text-caption font-medium ${
                done ? "text-text-primary" : "text-text-muted"
              }`}
            >
              {s.label}
            </span>
            <span className="mt-0.5 text-micro text-text-muted">
              {s.date ?? (done ? "Done" : "Pending")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div>
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd
        className={
          (mono ? "font-mono " : "") +
          (capitalize ? "capitalize " : "") +
          "mt-1 text-body-sm text-text-primary"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function TrackField({
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
      <dt className="text-micro uppercase tracking-wide text-feedback-success-text/70">
        {label}
      </dt>
      <dd
        className={
          (mono ? "font-mono " : "") +
          "mt-1 text-body-sm text-feedback-success-text"
        }
      >
        {value}
      </dd>
    </div>
  );
}
