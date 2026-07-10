"use client";

import * as React from "react";
import Link from "next/link";
import { Button, EmptyState, formatINR } from "@risitex/ui/components";
import { Check, CreditCard, FileText, Download, ArrowRight } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { fetchCredit, type CreditInvoice } from "@/lib/credit";
import { downloadOrderInvoice } from "@/lib/invoice";
import {
  listAllPurchaseOrders,
  type DraftPurchaseOrder,
} from "@/lib/purchase-orders";
import { COMPANY } from "@/lib/company";

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
    label: "Awaiting payment",
    text: "text-feedback-warning-text",
    dot: "bg-feedback-warning-text",
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
    pendingPOs: DraftPurchaseOrder[];
  }>({ loading: true, error: null, invoices: [], pendingPOs: [] });

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCredit().catch((err) => ({
        invoices: [] as CreditInvoice[],
        _error: err instanceof Error ? err.message : "Could not load invoices",
      })),
      listAllPurchaseOrders().catch(() => [] as DraftPurchaseOrder[]),
    ])
      .then(([credit, pos]) => {
        if (cancelled) return;
        // Credit invoices are an OPTIONAL data source — a buyer with no credit
        // terms gets a failure here. That must NOT blank the page: the POs
        // (issued/awaiting invoices) are the primary content and load
        // independently. So a credit failure just means "no credit invoices".
        const invoices =
          "_error" in credit ? [] : (credit.invoices as CreditInvoice[]);
        const pending = pos.filter(
          (p) =>
            (p.status === "draft" || p.status === "in_progress") &&
            !(p as unknown as { order?: { id?: string } | null }).order?.id,
        );
        setState({
          loading: false,
          error: null,
          invoices,
          pendingPOs: pending,
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: err instanceof Error ? err.message : "Could not load invoices",
            invoices: [],
            pendingPOs: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Same 4-stage progression as the shipments page: approved (invoice issued)
  // → payment recorded, awaiting approval → awaiting payment.
  const issued = state.pendingPOs.filter((p) => p.admin_approved_at);
  const queued = state.pendingPOs.filter(
    (p) => p.payment_confirmed_at && !p.admin_approved_at,
  );
  const awaiting = state.pendingPOs.filter((p) => !p.payment_confirmed_at);

  const hasAny =
    state.invoices.length > 0 || state.pendingPOs.length > 0;

  const poSum = (arr: DraftPurchaseOrder[]) =>
    arr.reduce((s, p) => s + Number(p.value_major ?? 0), 0);
  const invSum = (arr: CreditInvoice[]) =>
    arr.reduce((s, i) => s + Math.round(i.amount_major), 0);
  const totalBilled =
    poSum(issued) + poSum(queued) + poSum(awaiting) + invSum(state.invoices);
  const paid =
    poSum(issued) + invSum(state.invoices.filter((i) => i.status === "paid"));
  const outstanding = Math.max(0, totalBilled - paid);
  const count =
    issued.length + queued.length + awaiting.length + state.invoices.length;

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
              <Link href="/products">Open catalogue</Link>
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
            {issued.map((p) => (
              <InvoiceCard
                key={p.id}
                status="issued"
                idLabel={p.po_number}
                amountMajor={Number(p.value_major ?? 0)}
                subtitle={`Approved ${shortDate(p.admin_approved_at) ?? "—"} · paid via ${p.payment_confirmed_method ?? "—"}`}
                paymentMethod={p.payment_confirmed_method}
                showGstin
                showDoc
                steps={[
                  { label: "Placed", date: shortDate(p.created_at), done: true },
                  {
                    label: "Paid",
                    date: shortDate(p.payment_confirmed_at),
                    done: !!p.payment_confirmed_at,
                  },
                  {
                    label: "Approved",
                    date: shortDate(p.admin_approved_at),
                    done: !!p.admin_approved_at,
                  },
                  {
                    label: "Invoiced",
                    date: shortDate(p.admin_approved_at),
                    done: !!p.admin_approved_at,
                  },
                ]}
                actions={
                  <DownloadInvoiceButton id={p.id} reference={p.po_number} />
                }
              />
            ))}

            {state.invoices.map((inv) => {
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
                    {
                      label: "Paid",
                      date: null,
                      done: inv.status === "paid",
                    },
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

            {queued.map((p) => (
              <InvoiceCard
                key={p.id}
                status="awaiting_approval"
                idLabel={p.po_number}
                amountMajor={Number(p.value_major ?? 0)}
                subtitle={`Payment recorded · via ${p.payment_confirmed_method ?? "—"}`}
                steps={[
                  { label: "Placed", date: shortDate(p.created_at), done: true },
                  {
                    label: "Paid",
                    date: shortDate(p.payment_confirmed_at),
                    done: true,
                  },
                  { label: "Approved", date: null, done: false },
                  { label: "Invoiced", date: null, done: false },
                ]}
              />
            ))}

            {awaiting.map((p) => (
              <InvoiceCard
                key={p.id}
                status="awaiting_payment"
                idLabel={p.po_number}
                amountMajor={Number(p.value_major ?? 0)}
                subtitle={`Placed ${shortDate(p.created_at) ?? "—"} · record your payment reference`}
                steps={[
                  { label: "Placed", date: shortDate(p.created_at), done: true },
                  { label: "Paid", date: null, done: false },
                  { label: "Approved", date: null, done: false },
                  { label: "Invoiced", date: null, done: false },
                ]}
                actions={
                  <Button asChild size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>
                    <Link
                      href={`/b2b/purchase-orders/${encodeURIComponent(p.id)}`}
                    >
                      Confirm payment
                    </Link>
                  </Button>
                }
              />
            ))}
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
  return (
    <div className="my-5 flex items-center">
      {steps.map((s, i) => (
        <React.Fragment key={s.label}>
          <div className="flex flex-col items-center gap-1">
            <span
              className={`flex h-[18px] w-[18px] items-center justify-center rounded-full ${
                s.done
                  ? "bg-feedback-success-text text-white"
                  : "border-[1.5px] border-border-strong bg-surface-raised"
              }`}
            >
              {s.done && <Check className="h-2.5 w-2.5" />}
            </span>
            <span className="text-micro text-text-secondary">{s.label}</span>
            <span className="text-micro text-text-muted">{s.date ?? "—"}</span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`mb-7 h-0.5 flex-1 ${
                steps[i + 1]?.done
                  ? "bg-feedback-success-text"
                  : "bg-border-strong"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
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
