"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  formatINR,
} from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import {
  confirmPurchaseOrderPayment,
  type DraftPurchaseOrder,
  type PaymentConfirmation,
} from "@/lib/purchase-orders";
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

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentConfirmation["method"]; label: string }> = [
  { value: "bank_transfer", label: "Bank Transfer (NEFT / RTGS)" },
  { value: "upi", label: "UPI" },
  { value: "razorpay", label: "Razorpay (Card / UPI / NetBanking)" },
  { value: "cheque", label: "Cheque" },
  { value: "wallet", label: "Wallet" },
  { value: "credit_terms", label: "Credit Terms" },
  { value: "po_upload", label: "Internal PO" },
  { value: "proforma", label: "Proforma Invoice" },
  { value: "other", label: "Other" },
];

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [po, setPo] = React.useState<DraftPurchaseOrder | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
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

  const paymentConfirmed = !!po.payment_confirmed_at;
  const linkedToOrder = !!po.order;
  const adminApproved = !!po.admin_approved_at;
  const dispatched = !!po.dispatched_at || po.status === "fulfilled";
  const snapshotNotes =
    (po.metadata?.notes as string | undefined) ??
    (po.metadata?.payment_confirmed_notes as string | undefined) ??
    "";

  const fileUrl =
    po.file_url && !po.file_url.includes("placeholder")
      ? po.file_url.startsWith("http")
        ? po.file_url
        : `${MEDUSA_BASE_URL}${po.file_url.startsWith("/") ? "" : "/"}${po.file_url}`
      : null;

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title={po.po_number}
        subtitle={`Purchase order · ${new Date(po.created_at).toLocaleString("en-IN")}`}
      />

      {/* Top-level status banner */}
      <section
        className={
          (dispatched
            ? "border-feedback-success-border bg-feedback-success-bg"
            : adminApproved
              ? "border-feedback-success-border bg-feedback-success-bg"
              : paymentConfirmed
                ? "border-feedback-info-border bg-feedback-info-bg"
                : "border-feedback-warning-border bg-feedback-warning-bg") +
          " rounded-md border p-5"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p
              className={
                (dispatched
                  ? "text-feedback-success-text"
                  : adminApproved
                    ? "text-feedback-success-text"
                    : paymentConfirmed
                      ? "text-feedback-info-text"
                      : "text-feedback-warning-text") + " text-heading-sm"
              }
            >
              {dispatched
                ? "Order dispatched — in transit"
                : adminApproved
                  ? "Payment approved — order confirmed"
                  : paymentConfirmed
                    ? "Payment recorded — reconciling with finance"
                    : "Awaiting payment"}
            </p>
            <p
              className={
                (dispatched
                  ? "text-feedback-success-text/80"
                  : adminApproved
                    ? "text-feedback-success-text/80"
                    : paymentConfirmed
                      ? "text-feedback-info-text/80"
                      : "text-feedback-warning-text/80") + " mt-1 text-body-sm"
              }
            >
              {dispatched
                ? `Your order has been dispatched${po.dispatch_carrier ? ` via ${po.dispatch_carrier}` : ""}${po.dispatch_tracking_number ? ` (tracking: ${po.dispatch_tracking_number})` : ""}.`
                : adminApproved
                  ? "Your payment has been verified. Order is confirmed and will be dispatched soon."
                  : paymentConfirmed
                    ? `Your payment proof is logged. Finance verifies it against ${
                        po.payment_confirmed_method ?? "the bank statement"
                      } and promotes this PO to a confirmed order — usually within 1 business day.`
                    : "Record your payment proof below to move this PO forward."}
            </p>
          </div>
          <Badge
            tone={dispatched ? "success" : adminApproved ? "success" : paymentConfirmed ? "info" : "warning"}
          >
            {dispatched
              ? "dispatched"
              : adminApproved
                ? "confirmed"
                : paymentConfirmed
                  ? "payment confirmed"
                  : "awaiting payment"}
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
            {fileUrl && (
              <Button asChild variant="secondary" size="sm">
                <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Open PO file
                </a>
              </Button>
            )}
            {(linkedToOrder || adminApproved) && po.order?.id && (
              <Button
                variant="secondary"
                size="sm"
                isLoading={invoiceBusy}
                onClick={async () => {
                  setInvoiceBusy(true);
                  try {
                    await downloadOrderInvoice(
                      po.order!.id,
                      po.order!.display_id,
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

        {/* Right column: payment confirmation OR confirmed-state summary */}
        <aside aria-label="Payment status" className="space-y-4">
          {paymentConfirmed ? (
            <PaymentConfirmedCard po={po} />
          ) : (
            <PaymentForm
              poId={po.id}
              poValue={po.value_major}
              onConfirmed={async () => {
                await load();
              }}
            />
          )}

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

function PaymentForm({
  poId,
  poValue,
  onConfirmed,
}: {
  poId: string;
  poValue: number;
  onConfirmed: () => Promise<void>;
}) {
  const [method, setMethod] =
    React.useState<PaymentConfirmation["method"]>("bank_transfer");
  const [reference, setReference] = React.useState("");
  const [paidAt, setPaidAt] = React.useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (reference.trim().length < 2) {
      setErr("Enter the transaction / UTR / cheque reference (min 2 chars).");
      return;
    }
    setBusy(true);
    try {
      await confirmPurchaseOrderPayment(poId, {
        method,
        reference: reference.trim(),
        paid_at: paidAt ? new Date(paidAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
      });
      await onConfirmed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not record payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-md border border-border-subtle bg-surface-raised p-5"
    >
      <h3 className="text-heading-sm text-text-primary">Confirm payment</h3>
      <p className="mt-1 text-caption text-text-muted">
        Recording payment proof against this {formatINR(poValue)} PO moves it
        out of "awaiting payment" so ops can begin reconciliation. Finance
        verifies against the bank statement / gateway before dispatch.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-method" required>
            Method
          </Label>
          <Select
            value={method}
            onValueChange={(v) => setMethod(v as PaymentConfirmation["method"])}
          >
            <SelectTrigger id="pay-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-ref" required>
            Reference (UTR / Txn ID / Cheque #)
          </Label>
          <Input
            id="pay-ref"
            value={reference}
            onChange={(e) => setReference(e.currentTarget.value)}
            placeholder="UTR20260629ΓÇª"
            className="font-mono"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-date">Payment date</Label>
          <Input
            id="pay-date"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.currentTarget.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-notes">Notes (optional)</Label>
          <Textarea
            id="pay-notes"
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            rows={2}
            placeholder="Bank used, payer name on the slip, etc."
          />
        </div>
        {err && (
          <p
            role="alert"
            className="rounded-md bg-feedback-danger-bg px-3 py-2 text-body-sm text-feedback-danger-text ring-1 ring-feedback-danger-border"
          >
            {err}
          </p>
        )}
        <Button type="submit" isLoading={busy} disabled={busy}>
          Record payment
        </Button>
      </div>
    </form>
  );
}

function PaymentConfirmedCard({ po }: { po: DraftPurchaseOrder }) {
  const at = po.payment_confirmed_at
    ? new Date(po.payment_confirmed_at).toLocaleString("en-IN")
    : "ΓÇö";
  return (
    <section className="rounded-md border border-feedback-success-border bg-feedback-success-bg p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2
          className="mt-0.5 h-5 w-5 text-feedback-success-text"
          aria-hidden
        />
        <div>
          <p className="text-body-md font-medium text-feedback-success-text">
            Payment recorded
          </p>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-caption text-feedback-success-text/80">
            <div>
              <dt className="opacity-70">Method</dt>
              <dd className="text-body-sm text-feedback-success-text">
                {po.payment_confirmed_method ?? "ΓÇö"}
              </dd>
            </div>
            <div>
              <dt className="opacity-70">Reference</dt>
              <dd className="font-mono text-body-sm text-feedback-success-text">
                {po.payment_confirmed_reference ?? "ΓÇö"}
              </dd>
            </div>
            <div>
              <dt className="opacity-70">Confirmed at</dt>
              <dd className="text-body-sm text-feedback-success-text">{at}</dd>
            </div>
          </dl>
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
