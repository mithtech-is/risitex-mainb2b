"use client";

import * as React from "react";
import Link from "next/link";
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
  StatCard,
  formatINR,
} from "@risitex/ui/components";
import { Search, FileText, Upload, X } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { downloadOrderInvoice } from "@/lib/invoice";
import {
  createPurchaseOrder,
  uploadFile,
} from "@/lib/purchase-orders";

/**
 * /b2b/purchase-orders — live read of /store/purchase-orders.
 *
 * Status is derived backend-side from the linked order's
 * fulfillment_status — never trust the frontend to compute it. The
 * page just renders.
 *
 * "Upload draft PO" creates a PurchaseOrder row with no linked
 * order (status: draft). The customer can later attach it to an
 * order at the Net-terms checkout step. The wholesale checkout
 * flow itself remains the canonical attachment seam — this page is
 * the inventory of PO documents.
 */

type PurchaseOrder = {
  id: string;
  po_number: string;
  file_url: string | null;
  value_major: number;
  currency_code: string;
  expected_payment_date: string | null;
  created_at: string;
  updated_at: string;
  order: {
    id: string;
    display_id: number | string;
    status: string | null;
    payment_status: string | null;
    fulfillment_status: string | null;
  } | null;
  status: "draft" | "in_progress" | "fulfilled" | "cancelled";
  /** Buyer-side payment confirmation (set by POST /confirm-payment). When
   *  present, the row shows a "payment confirmed" tone alongside the
   *  derived status — finance team reconciles next. */
  payment_confirmed_at?: string | null;
  payment_confirmed_method?: string | null;
  payment_confirmed_reference?: string | null;
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In progress" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_TONE: Record<
  PurchaseOrder["status"],
  "success" | "warning" | "danger" | "info"
> = {
  draft: "warning",
  in_progress: "info",
  fulfilled: "success",
  cancelled: "danger",
};
const STATUS_LABEL: Record<PurchaseOrder["status"], string> = {
  draft: "draft",
  in_progress: "in progress",
  fulfilled: "fulfilled",
  cancelled: "cancelled",
};

async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = window.localStorage.getItem("medusa_auth_token");
  }
  const headers: Record<string, string> = {
    "x-publishable-api-key": PUB_KEY,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${MEDUSA_BASE_URL}/store/purchase-orders`, {
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const b = (await res.json()) as { message?: string };
      detail = b?.message ?? "";
    } catch {
      // ignore
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { purchase_orders: PurchaseOrder[] };
  return body.purchase_orders ?? [];
}

function PoInvoiceButton({
  orderId,
  displayId,
}: {
  orderId: string;
  displayId: number | string;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      size="xs"
      variant="tertiary"
      isLoading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadOrderInvoice(orderId, displayId);
        } catch {
          // silent on failure
        } finally {
          setBusy(false);
        }
      }}
    >
      Invoice
    </Button>
  );
}

export default function B2bPurchaseOrdersPage() {
  const [pos, setPos] = React.useState<PurchaseOrder[] | null>(null);
  const [authErr, setAuthErr] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [uploading, setUploading] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const rows = await fetchPurchaseOrders();
      setPos(rows);
      setAuthErr(false);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (/401|Not authenticated/i.test(msg)) {
        setAuthErr(true);
      } else if (/account_not_verified|403/i.test(msg)) {
        setError(
          "Finish verifying your email and phone to see purchase orders.",
        );
      } else {
        setError(msg || "Couldn't load purchase orders.");
      }
      setPos([]);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void load().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const all = pos ?? [];
  const filtered = all.filter((p) => {
    if (q && !p.po_number.toLowerCase().includes(q.toLowerCase())) return false;
    if (status !== "all" && p.status !== status) return false;
    return true;
  });

  const totalValue = all.reduce((s, p) => s + p.value_major, 0);
  const draft = all.filter((p) => p.status === "draft").length;

  // "This quarter" count — POs created on or after the start of the
  // current calendar quarter.
  const now = new Date();
  const qStart = new Date(
    now.getFullYear(),
    Math.floor(now.getMonth() / 3) * 3,
    1,
  );
  const thisQuarter = all.filter(
    (p) => new Date(p.created_at) >= qStart,
  ).length;

  const isLoading = pos === null && !error && !authErr;

  if (authErr) {
    return (
      <>
        <header className="mb-6">
          <B2bTopbar
            title="Purchase orders"
            subtitle="PO documents attached to your B2B orders"
          />
        </header>
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="Sign in to see your purchase orders"
          description="POs are tied to the orders on your account."
          action={
            <Button asChild>
              <Link href="/auth/sign-in">Sign in</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title="Purchase orders"
          subtitle="PO documents attached to your B2B orders"
          rightActions={
            <Button
              size="sm"
              onClick={() => setUploading((s) => !s)}
              disabled={authErr}
            >
              {uploading ? (
                <>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Cancel
                </>
              ) : (
                <>
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  Upload draft PO
                </>
              )}
            </Button>
          }
        />
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      )}

      {uploading && (
        <UploadForm
          onSuccess={async () => {
            setUploading(false);
            await load();
          }}
          onCancel={() => setUploading(false)}
        />
      )}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="POs raised"
          value={isLoading ? "…" : all.length.toString()}
        />
        <StatCard
          label="Drafts"
          value={isLoading ? "…" : draft.toString()}
          tone="muted"
          unit="no order attached"
        />
        <StatCard
          label="PO value"
          value={isLoading ? "…" : formatINR(Math.round(totalValue))}
        />
        <StatCard
          label="This quarter"
          value={isLoading ? "…" : thisQuarter.toString()}
          unit="POs"
        />
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          leftAdornment={<Search className="h-4 w-4" />}
          placeholder="Search PO number…"
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-caption text-text-muted">
          {filtered.length} match{filtered.length === 1 ? "" : "es"}
        </span>
      </div>

      {isLoading ? (
        <p className="mt-8 text-body-md text-text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title={
              all.length === 0 ? "No purchase orders yet" : "No matches"
            }
            description={
              all.length === 0
                ? "POs are uploaded at the Net-terms checkout step on an order with credit terms."
                : "Try clearing the search or changing the status filter."
            }
            action={
              all.length === 0 ? (
                <Button asChild>
                  <Link href="/wholesale/catalogue">Open catalogue</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border-subtle bg-surface-raised">
          <table className="w-full numerics-tabular">
            <thead>
              <tr className="border-b border-border-subtle text-caption text-text-muted">
                <th className="px-5 py-3 text-left">PO</th>
                <th className="px-5 py-3 text-left">Raised</th>
                <th className="px-5 py-3 text-left">Linked order</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-right">Value</th>
                <th className="px-5 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((po) => {
                const paid = !!po.payment_confirmed_at;
                return (
                  <tr
                    key={po.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-sunken transition-colors duration-fast"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/b2b/purchase-orders/${encodeURIComponent(po.id)}`}
                        className="inline-flex items-center gap-2 font-mono text-body-sm text-text-primary underline-offset-4 hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5 text-text-muted" />
                        {po.po_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-body-sm text-text-secondary">
                      {new Date(po.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-body-sm text-text-secondary">
                      {po.order ? (
                        <Link
                          href={`/b2b/orders?order=${encodeURIComponent(po.order.id)}`}
                          className="font-mono underline-offset-4 hover:underline"
                        >
                          RST-
                          {String(po.order.display_id).padStart(6, "0")}
                        </Link>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS_TONE[po.status]} size="xs">
                          {STATUS_LABEL[po.status]}
                        </Badge>
                        {paid && !po.order && (
                          <Badge tone="info" size="xs">
                            payment confirmed
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-body-sm text-text-primary">
                      {formatINR(po.value_major)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Button asChild size="xs" variant="tertiary">
                          <Link href={`/b2b/purchase-orders/${encodeURIComponent(po.id)}`}>
                            View
                          </Link>
                        </Button>
                        {po.file_url && (
                          <Button asChild size="xs" variant="tertiary">
                            <a
                              href={po.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              PO file
                            </a>
                          </Button>
                        )}
                        {po.order && (
                          <>
                            <PoInvoiceButton
                              orderId={po.order.id}
                              displayId={po.order.display_id}
                            />
                            <Button asChild size="xs" variant="tertiary">
                              <Link href={`/b2b/orders?order=${encodeURIComponent(po.order.id)}`}>
                                Open order
                              </Link>
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function UploadForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => Promise<void>;
  onCancel: () => void;
}) {
  const [poNumber, setPoNumber] = React.useState("");
  const [valueMajor, setValueMajor] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const valueOk =
    /^[0-9]+$/.test(valueMajor.trim()) && Number(valueMajor) > 0;
  const fileOk =
    !!file &&
    /\.(pdf|jpg|jpeg|png)$/i.test(file.name) &&
    file.size <= 5 * 1024 * 1024;

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !valueOk) return;
    setErr(null);
    setSubmitting(true);
    try {
      const fileUrl = await uploadFile(file);
      await createPurchaseOrder({
        po_number: poNumber.trim(),
        file_url: fileUrl,
        value_major: Number(valueMajor),
        expected_payment_date: paymentDate
          ? new Date(paymentDate).toISOString()
          : undefined,
        notes: notes.trim() || undefined,
      });
      setPoNumber("");
      setValueMajor("");
      setPaymentDate("");
      setNotes("");
      setFile(null);
      await onSuccess();
    } catch (e) {
      setErr((e as Error).message ?? "Couldn't save the PO");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handle}
      className="mb-6 rounded-lg border border-border-subtle bg-surface-raised p-5"
    >
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-micro text-text-muted">New purchase order</p>
          <p className="text-body-md text-text-primary">
            Upload a PO document. It sits as a draft until you attach it
            to an order at the Net-terms checkout step.
          </p>
        </div>
      </header>

      {err && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-feedback-danger-bg px-3 py-2 text-caption text-feedback-danger-text ring-1 ring-feedback-danger-border"
        >
          {err}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="po-number" required>
            PO number
          </Label>
          <Input
            id="po-number"
            value={poNumber}
            onChange={(e) => setPoNumber(e.currentTarget.value)}
            placeholder="PO-26-Q3-00184"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="po-value" required>
            Value (₹)
          </Label>
          <Input
            id="po-value"
            type="number"
            inputMode="numeric"
            min={1}
            value={valueMajor}
            onChange={(e) =>
              setValueMajor(e.currentTarget.value.replace(/\D/g, ""))
            }
            placeholder="184500"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="po-paydate">Expected payment date</Label>
          <Input
            id="po-paydate"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.currentTarget.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="po-file" required>
            File (PDF / JPG / PNG, max 5 MB)
          </Label>
          <input
            id="po-file"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0] ?? null;
              setFile(f);
            }}
            required
            className="text-body-sm"
          />
          {file && !fileOk && (
            <p className="text-caption text-feedback-danger-text">
              File must be PDF / JPG / PNG and under 5 MB.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="po-notes">Notes (optional)</Label>
          <Input
            id="po-notes"
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            placeholder="Buyer department, project code, etc."
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          type="submit"
          isLoading={submitting}
          disabled={
            !poNumber.trim() || !valueOk || !fileOk || submitting
          }
        >
          Save draft PO
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
