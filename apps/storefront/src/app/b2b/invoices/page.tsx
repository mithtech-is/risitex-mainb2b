"use client";

import * as React from "react";
import Link from "next/link";
import { Button, EmptyState, formatINR } from "@risitex/ui/components";
import { Check, CreditCard, FileText, Download, ArrowRight } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { fetchCredit, type CreditInvoice } from "@/lib/credit";
import { downloadOrderInvoice } from "@/lib/invoice";
import { medusa } from "@/lib/medusa";
import {
  listAllPurchaseOrders,
  type DraftPurchaseOrder,
} from "@/lib/purchase-orders";
import { COMPANY } from "@/lib/company";

type Order = {
  id: string;
  display_id: number | string;
  status?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  created_at: string;
  total: number;
};

type CardStatus =
  | "issued"
  | "awaiting_approval"
  | "awaiting_payment"
  | "paid"
  | "overdue"
  | "due_soon"
  | "pending";

type Step = { label: string; date: string | null; done: boolean };

const STATUS_META: Record<
  CardStatus,
  { label: string; text: string; dot: string }
> = {
  issued: {
    label: "Invoice issued · paid in full",
    text: "text-feedback-success-text",
    dot: "bg-feedback-success-text",
  },
  paid: {
    label: "Paid",
    text: "text-feedback-success-text",
    dot: "bg-feedback-success-text",
  },
  awaiting_approval: {
    label: "Awaiting admin approval",
    text: "text-feedback-info-text",
    dot: "bg-feedback-info-text",
  },
  awaiting_payment: {
    label: "Order placed",
    text: "text-feedback-success-text",
    dot: "bg-feedback-success-text",
  },
  due_soon: {
    label: "Due soon",
    text: "text-feedback-warning-text",
    dot: "bg-feedback-warning-text",
  },
  overdue: {
    label: "Overdue",
    text: "text-feedback-danger-text",
    dot: "bg-feedback-danger-text",
  },
  pending: {
    label: "Invoice pending",
    text: "text-text-muted",
    dot: "bg-text-muted",
  },
};

function shortDate(x?: string | null): string | null {
  if (!x) return null;
  try {
    return new Date(x).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return null;
  }
}

export default function InvoicesPage() {
  const [state, setState] = React.useState<{
    loading: boolean;
    error: string | null;
    invoices: CreditInvoice[];
    pos: DraftPurchaseOrder[];
    orders: Order[];
  }>({ loading: true, error: null, invoices: [], pos: [], orders: [] });

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      // Native orders are the source of truth for an invoice — the GST invoice
      // is issued when the order is created. Each independently .catch()es so
      // one failing source never blanks the page.
      medusa()
        .store.order.list({
          limit: 250,
          fields:
            "id,display_id,status,payment_status,fulfillment_status,created_at,total",
        } as Record<string, unknown>)
        .then((r) => ((r as { orders?: Order[] }).orders ?? []) as Order[])
        .catch(() => [] as Order[]),
      listAllPurchaseOrders().catch(() => [] as DraftPurchaseOrder[]),
      // Credit invoices are OPTIONAL — a buyer with no credit terms fails here;
      // that must not blank the page.
      fetchCredit()
        .then((c) => c.invoices ?? [])
        .catch(() => [] as CreditInvoice[]),
    ])
      .then(([orders, pos, invoices]) => {
        if (cancelled) return;
        setState({ loading: false, error: null, invoices, pos, orders });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            error:
              err instanceof Error ? err.message : "Could not load invoices",
            invoices: [],
            pos: [],
            orders: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Join each native order to its purchase order so the invoice card can show
  // the approval / payment milestones the order row itself doesn't carry.
  const poByOrderId = new Map<string, DraftPurchaseOrder>();
  for (const p of state.pos) {
    const oid = (p as unknown as { order?: { id?: string } | null }).order?.id;
    if (oid) poByOrderId.set(oid, p);
  }
  // POs not yet promoted to an order (awaiting payment / approval).
  const orphanPOs = state.pos.filter(
    (p) => !(p as unknown as { order?: { id?: string } | null }).order?.id,
  );

  // A checkout payment is stamped on PO metadata as payment_captured_at (buyer
  // paid) → payment_verified_at (admin verified); the confirm-payment flow sets
  // payment_confirmed_at. Any of them means the buyer has paid.
  const poPaidAt = (po?: DraftPurchaseOrder): string | null => {
    if (!po) return null;
    const meta = (po.metadata ?? {}) as Record<string, unknown>;
    const pick = (k: string) =>
      typeof meta[k] === "string" ? (meta[k] as string) : null;
    return (
      po.payment_confirmed_at ||
      pick("payment_verified_at") ||
      pick("payment_captured_at") ||
      null
    );
  };
  const orderPaid = (o: Order, po?: DraftPurchaseOrder) => {
    const ps = (o.payment_status ?? "").toLowerCase();
    return (
      ps === "captured" ||
      ps === "paid" ||
      ps === "partially_refunded" ||
      !!poPaidAt(po)
    );
  };
  const orderApproved = (po?: DraftPurchaseOrder) => !!po?.admin_approved_at;

  const hasAny =
    state.orders.length > 0 ||
    orphanPOs.length > 0 ||
    state.invoices.length > 0;

  // The billed amount is the PO's value_major (discount + GST included); the
  // native order.total omits the coupon, so it disagrees with the order detail.
  const orderBilled = (o: Order) =>
    Number(poByOrderId.get(o.id)?.value_major ?? o.total ?? 0);
  const orderSum = (arr: Order[]) => arr.reduce((s, o) => s + orderBilled(o), 0);
  const poSum = (arr: DraftPurchaseOrder[]) =>
    arr.reduce((s, p) => s + Number(p.value_major ?? 0), 0);
  const invSum = (arr: CreditInvoice[]) =>
    arr.reduce((s, i) => s + Math.round(i.amount_major), 0);
  const totalBilled =
    orderSum(state.orders) + poSum(orphanPOs) + invSum(state.invoices);
  const paid =
    orderSum(
      state.orders.filter((o) => orderPaid(o, poByOrderId.get(o.id))),
    ) + invSum(state.invoices.filter((i) => i.status === "paid"));
  const outstanding = Math.max(0, totalBilled - paid);
  const count =
    state.orders.length + orphanPOs.length + state.invoices.length;

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Invoices"
        subtitle="GST invoices and payment status"
        rightActions={
          count > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" />}
            >
              Download all
            </Button>
          ) : undefined
        }
      />

      {state.loading && (
        <div className="rounded-xl border border-border-subtle bg-surface-raised p-6">
          <p className="text-body-sm text-text-muted">Loading invoices…</p>
        </div>
      )}

      {state.error && (
        <EmptyState title="Could not load invoices" description={state.error} />
      )}

      {!state.loading && !state.error && !hasAny && (
        <EmptyState
          title="No invoices yet"
          description="Completed wholesale orders and credit invoices will appear here."
          action={
            <Button asChild>
              <Link href="/wholesale/catalogue">Open catalogue</Link>
            </Button>
          }
        />
      )}

      {!state.loading && !state.error && hasAny && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryTile label="Invoices" value={String(count)} />
            <SummaryTile label="Total billed" value={formatINR(totalBilled)} />
            <SummaryTile
              label="Paid"
              value={formatINR(paid)}
              tone="success"
            />
            <SummaryTile label="Outstanding" value={formatINR(outstanding)} />
          </div>

          <div className="flex flex-col gap-3">
            {state.orders.map((o) => {
              const po = poByOrderId.get(o.id);
              const approved = orderApproved(po);
              const paidNow = orderPaid(o, po);
              const idLabel = `RST-${String(o.display_id).padStart(6, "0")}`;
              const status: CardStatus = approved
                ? "issued"
                : paidNow
                  ? "awaiting_approval"
                  : "awaiting_payment";
              return (
                <InvoiceCard
                  key={o.id}
                  status={status}
                  idLabel={idLabel}
                  amountMajor={orderBilled(o)}
                  subtitle={
                    approved
                      ? `Approved ${shortDate(po?.admin_approved_at) ?? "—"}${po?.payment_confirmed_method ? ` · paid via ${po.payment_confirmed_method}` : ""}`
                      : paidNow
                        ? "Awaiting admin approval — we'll confirm shortly"
                        : `Placed ${shortDate(o.created_at) ?? "—"} · confirmation in progress (2–6 min)`
                  }
                  paymentMethod={po?.payment_confirmed_method}
                  showGstin
                  showDoc={approved}
                  steps={[
                    { label: "Placed", date: shortDate(o.created_at), done: true },
                    {
                      label: "Paid",
                      date: shortDate(poPaidAt(po)),
                      done: paidNow,
                    },
                    {
                      label: "Approved",
                      date: shortDate(po?.admin_approved_at),
                      done: approved,
                    },
                    {
                      label: "Invoiced",
                      date: shortDate(po?.admin_approved_at),
                      done: approved,
                    },
                  ]}
                  actions={
                    approved ? (
                      <DownloadInvoiceButton
                        id={o.id}
                        reference={String(o.display_id)}
                      />
                    ) : po ? (
                      <Button
                        asChild
                        variant="secondary"
                        size="sm"
                        rightIcon={<ArrowRight className="h-4 w-4" />}
                      >
                        <Link href={`/b2b/orders/${encodeURIComponent(po.id)}`}>
                          View order
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              );
            })}

            {orphanPOs.map((p) => {
              const paidAtPO = poPaidAt(p);
              const paidPO = !!paidAtPO;
              return (
                <InvoiceCard
                  key={p.id}
                  status={paidPO ? "awaiting_approval" : "awaiting_payment"}
                  idLabel={p.po_number}
                  amountMajor={Number(p.value_major ?? 0)}
                  subtitle={
                    paidPO
                      ? `Awaiting admin approval — we'll confirm shortly`
                      : `Placed ${shortDate(p.created_at) ?? "—"} · confirmation in progress (2–6 min)`
                  }
                  steps={[
                    { label: "Placed", date: shortDate(p.created_at), done: true },
                    {
                      label: "Paid",
                      date: shortDate(paidAtPO),
                      done: paidPO,
                    },
                    { label: "Approved", date: null, done: false },
                    { label: "Invoiced", date: null, done: false },
                  ]}
                  actions={
                    <Button
                      asChild
                      variant="secondary"
                      size="sm"
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                    >
                      <Link href={`/b2b/orders/${encodeURIComponent(p.id)}`}>
                        View order
                      </Link>
                    </Button>
                  }
                />
              );
            })}

            {state.invoices
              .filter((inv) => !state.orders.some((o) => o.id === inv.order_id))
              .map((inv) => {
              const st: CardStatus =
                inv.status === "paid"
                  ? "paid"
                  : inv.status === "overdue"
                    ? "overdue"
                    : inv.status === "due_soon"
                      ? "due_soon"
                      : "pending";
              return (
                <InvoiceCard
                  key={inv.id}
                  status={st}
                  idLabel={`RST-${String(inv.display_id).padStart(6, "0")}`}
                  amountMajor={Math.round(inv.amount_major)}
                  subtitle={`Order #${inv.display_id}`}
                  showGstin
                  showDoc
                  steps={[
                    { label: "Issued", date: null, done: true },
                    { label: "Paid", date: null, done: inv.status === "paid" },
                  ]}
                  actions={
                    <DownloadInvoiceButton
                      id={inv.order_id}
                      reference={String(inv.display_id)}
                    />
                  }
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="rounded-lg bg-surface-sunken px-4 py-3">
      <p className="text-caption text-text-secondary">{label}</p>
      <p
        className={`mt-1 numerics-tabular text-heading-md ${
          tone === "success" ? "text-feedback-success-text" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function InvoiceCard({
  status,
  idLabel,
  amountMajor,
  subtitle,
  steps,
  paymentMethod,
  showGstin,
  showDoc,
  actions,
}: {
  status: CardStatus;
  idLabel: string;
  amountMajor: number;
  subtitle?: string;
  steps: Step[];
  paymentMethod?: string | null;
  showGstin?: boolean;
  showDoc?: boolean;
  actions?: React.ReactNode;
}) {
  const meta = STATUS_META[status];
  return (
    <article className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised">
      {/* Status band */}
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-sunken px-6 py-2.5">
        <span
          className={`inline-flex items-center gap-2 text-micro uppercase ${meta.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        <span className="font-mono text-caption text-text-muted">{idLabel}</span>
      </div>

      <div
        className={`grid grid-cols-1 gap-6 p-6 ${showDoc ? "md:grid-cols-[1.45fr_1fr]" : ""}`}
      >
        <div>
          <p className="text-micro uppercase text-text-muted">Amount</p>
          <p
            className="mt-1 font-display text-text-primary numerics-tabular"
            style={{ fontSize: "32px", lineHeight: 1.05 }}
          >
            {formatINR(amountMajor)}
          </p>
          {subtitle && (
            <p className="mt-1.5 text-caption text-text-secondary">{subtitle}</p>
          )}

          <Rail steps={steps} />

          {(paymentMethod || showGstin) && (
            <div className="flex flex-wrap gap-2">
              {paymentMethod && (
                <Chip icon={<CreditCard className="h-3.5 w-3.5" />}>
                  <span className="capitalize">{paymentMethod}</span>
                </Chip>
              )}
              {showGstin && (
                <Chip icon={<FileText className="h-3.5 w-3.5" />}>
                  GSTIN {COMPANY.gstin}
                </Chip>
              )}
            </div>
          )}

          {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        </div>

        {showDoc && <DocPreview amountMajor={amountMajor} />}
      </div>
    </article>
  );
}

function Rail({ steps }: { steps: Step[] }) {
  // These milestones are strictly sequential — reaching a later one means all
  // earlier ones happened too (an approved/invoiced order is, by definition,
  // paid). Fill every node up to the furthest-reached step so the timeline is
  // always a clean progression, never "Approved ✓ while Paid ○". Each step is
  // an equal-width column with its node centred and connector halves joining
  // neighbours, so labels sit exactly under their node.
  const lastDone = steps.reduce((acc, s, i) => (s.done ? i : acc), -1);
  return (
    <ol className="my-5 flex items-start">
      {steps.map((s, i) => {
        const done = i <= lastDone;
        const first = i === 0;
        const last = i === steps.length - 1;
        return (
          <li
            key={s.label}
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
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${
                  done
                    ? "bg-feedback-success-text text-white"
                    : "border-[1.5px] border-border-strong bg-surface-raised"
                }`}
              >
                {done && (
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                )}
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
              className={`mt-2 text-micro ${
                done ? "text-text-primary" : "text-text-secondary"
              }`}
            >
              {s.label}
            </span>
            <span className="text-micro text-text-muted">{s.date ?? "—"}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Chip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1 text-caption text-text-secondary">
      {icon}
      {children}
    </span>
  );
}

function DocPreview({ amountMajor }: { amountMajor: number }) {
  return (
    <div className="self-start rounded-xl border border-border-subtle bg-surface-sunken p-4">
      <div className="flex items-center justify-between">
        <span className="font-display tracking-widest text-body-md text-brand-accent">
          RISITEX
        </span>
        <span className="text-micro uppercase text-text-muted">Tax invoice</span>
      </div>
      <p className="mt-0.5 text-micro text-text-muted">
        Lalbagh Road, Bangalore 560027
      </p>
      <div className="my-3 h-px bg-border-subtle" />
      <div className="flex flex-col gap-2">
        {[52, 44, 60].map((w, i) => (
          <div key={i} className="flex items-center justify-between">
            <span
              className="h-1.5 rounded-full bg-border-strong"
              style={{ width: `${w}%` }}
            />
            <span className="h-1.5 w-1/5 rounded-full bg-border-subtle" />
          </div>
        ))}
      </div>
      <div className="my-3 h-px bg-border-subtle" />
      <div className="flex items-baseline justify-between">
        <span className="text-caption text-text-secondary">Total</span>
        <span className="numerics-tabular text-body-sm font-medium text-text-primary">
          {formatINR(amountMajor)}
        </span>
      </div>
    </div>
  );
}

function DownloadInvoiceButton({
  id,
  reference,
}: {
  id: string;
  reference: string;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        isLoading={loading}
        leftIcon={<Download className="h-4 w-4" />}
        onClick={async () => {
          setError(null);
          setLoading(true);
          try {
            await downloadOrderInvoice(id, reference);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Download failed");
          } finally {
            setLoading(false);
          }
        }}
      >
        Download invoice
      </Button>
      {error && (
        <p className="text-caption text-feedback-danger-text">{error}</p>
      )}
    </div>
  );
}
