"use client";

import * as React from "react";
import Link from "next/link";
import { Badge, Button, EmptyState, formatINR } from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import {
  dueLine,
  fetchCredit,
  invoiceLabel,
  type CreditInvoice,
} from "@/lib/credit";
import { downloadOrderInvoice } from "@/lib/invoice";
import {
  listAllPurchaseOrders,
  type DraftPurchaseOrder,
} from "@/lib/purchase-orders";

function invoiceTone(
  s: CreditInvoice["status"],
): "success" | "warning" | "danger" | "info" {
  if (s === "paid") return "success";
  if (s === "overdue") return "danger";
  if (s === "due_soon") return "warning";
  return "info";
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
        const invoices =
          "_error" in credit ? [] : (credit.invoices as CreditInvoice[]);
        const errMsg = "_error" in credit ? credit._error : null;
        // POs that haven't been promoted to a Medusa order yet — i.e. still
        // awaiting payment capture. GST invoice is issued at order creation,
        // so these don't have invoices yet, and the buyer needs to see why.
        const pending = pos.filter(
          (p) =>
            (p.status === "draft" || p.status === "in_progress") &&
            !(p as unknown as { order?: { id?: string } | null }).order?.id,
        );
        setState({
          loading: false,
          error: errMsg ?? null,
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

  const hasInvoices = state.invoices.length > 0;
  const hasPending = state.pendingPOs.length > 0;

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar title="Invoices" subtitle="GST invoices and payment status" />
      {state.loading && (
        <div className="rounded-md border border-border-subtle bg-surface-raised p-6">
          <p className="text-body-sm text-text-muted">Loading invoices...</p>
        </div>
      )}
      {state.error && (
        <EmptyState title="Could not load invoices" description={state.error} />
      )}

      {!state.loading && hasPending && (() => {
        // Same 4-stage progression as the shipments page: dispatched →
        // approved → payment-recorded → awaiting payment.
        const issued = state.pendingPOs.filter((p) => p.admin_approved_at);
        const queued = state.pendingPOs.filter(
          (p) => p.payment_confirmed_at && !p.admin_approved_at,
        );
        const awaiting = state.pendingPOs.filter(
          (p) => !p.payment_confirmed_at,
        );
        return (
          <>
            {issued.length > 0 && (
              <section
                aria-label="Approved purchase orders with invoice issued"
                className="rounded-md border border-feedback-success-border bg-feedback-success-bg p-5"
              >
                <h2 className="text-heading-sm text-feedback-success-text">
                  {issued.length} invoice{issued.length === 1 ? "" : "s"} issued
                </h2>
                <p className="mt-1 text-caption text-feedback-success-text/80">
                  Admin approved the payment — GST invoice is issued.
                  Download your invoice below; a finalised tax invoice
                  follows from finance.
                </p>
                <ul className="mt-4 space-y-2">
                  {issued.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-feedback-success-border bg-surface-background p-4"
                    >
                      <div>
                        <p className="font-mono text-body-sm text-text-primary">
                          {p.po_number}
                        </p>
                        <p className="mt-0.5 text-caption text-text-muted">
                          ₹{Number(p.value_major ?? 0).toLocaleString("en-IN")} ·
                          approved {p.admin_approved_at
                            ? new Date(p.admin_approved_at).toLocaleDateString()
                            : "—"}{" "}
                          · paid via {p.payment_confirmed_method ?? "—"}
                        </p>
                      </div>
                      <div className="inline-flex gap-2">
                        <Badge tone="success" size="xs">Invoice issued</Badge>
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => {
                            downloadOrderInvoice(p.id, p.po_number).catch(
                              console.error,
                            );
                          }}
                        >
                          Download
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {queued.length > 0 && (
              <section
                aria-label="Purchase orders awaiting admin approval"
                className="rounded-md border border-feedback-info-border bg-feedback-info-bg p-5"
              >
                <h2 className="text-heading-sm text-feedback-info-text">
                  {queued.length} purchase order{queued.length === 1 ? "" : "s"} awaiting admin approval
                </h2>
                <p className="mt-1 text-caption text-feedback-info-text/80">
                  Payment proof recorded. Admin reconciles the payment and
                  issues the GST invoice next — usually within 1 business day.
                </p>
                <ul className="mt-4 space-y-2">
                  {queued.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-feedback-info-border bg-surface-background p-4"
                    >
                      <div>
                        <p className="font-mono text-body-sm text-text-primary">
                          {p.po_number}
                        </p>
                        <p className="mt-0.5 text-caption text-text-muted">
                          ₹{Number(p.value_major ?? 0).toLocaleString("en-IN")} · paid via{" "}
                          {p.payment_confirmed_method ?? "—"}
                        </p>
                      </div>
                      <div className="inline-flex gap-2">
                        <Badge tone="info" size="xs">Awaiting approval</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {awaiting.length > 0 && (
              <section
                aria-label="Purchase orders awaiting payment"
                className="rounded-md border border-feedback-warning-border bg-feedback-warning-bg p-5"
              >
                <h2 className="text-heading-sm text-feedback-warning-text">
                  {awaiting.length} purchase order{awaiting.length === 1 ? "" : "s"} awaiting payment
                </h2>
                <p className="mt-1 text-caption text-feedback-warning-text/80">
                  GST invoices generate after payment lands. Open each PO to
                  record the payment reference (UTR / Txn ID / Cheque #) so
                  finance can match it against your bank statement.
                </p>
                <ul className="mt-4 space-y-2">
                  {awaiting.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-feedback-warning-border bg-surface-background p-4"
                    >
                      <div>
                        <p className="font-mono text-body-sm text-text-primary">
                          {p.po_number}
                        </p>
                        <p className="mt-0.5 text-caption text-text-muted">
                          ₹{Number(p.value_major ?? 0).toLocaleString("en-IN")} ·
                          placed {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="inline-flex gap-2">
                        <Badge tone="warning" size="xs">Invoice pending</Badge>
                        <Button asChild size="sm">
                          <Link href={`/b2b/purchase-orders/${encodeURIComponent(p.id)}`}>
                            Confirm payment
                          </Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        );
      })()}

      {!state.loading && !state.error && !hasInvoices && !hasPending && (
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

      {!state.loading && !state.error && hasInvoices && (
        <div>
          <h2 className="mb-3 text-heading-sm text-text-primary">
            Issued invoices
          </h2>
          <div className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface-raised">
            {state.invoices.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: CreditInvoice }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const download = async () => {
    setError(null);
    setLoading(true);
    try {
      await downloadOrderInvoice(invoice.order_id, invoice.display_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-body-md text-text-primary">
            RST-{String(invoice.display_id).padStart(6, "0")}
          </h2>
          <Badge tone={invoiceTone(invoice.status)} size="xs">
            {invoiceLabel(invoice.status)}
          </Badge>
        </div>
        <p className="mt-1 text-body-sm text-text-muted">
          {dueLine(invoice)} - {formatINR(Math.round(invoice.amount_major))}
        </p>
        {error && (
          <p className="mt-1 text-caption text-feedback-danger-text">{error}</p>
        )}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        isLoading={loading}
        onClick={download}
      >
        Download invoice
      </Button>
    </article>
  );
}
