"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
  formatINR,
} from "@risitex/ui/components";
import { ShoppingBag, Search } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { ReorderButton } from "@/components/b2b/reorder-button";
import { medusa } from "@/lib/medusa";
import { downloadOrderInvoice } from "@/lib/invoice";
import { listAllPurchaseOrders, type DraftPurchaseOrder } from "@/lib/purchase-orders";

/**
 * /b2b/orders — wholesale order history, wired to /store/orders.
 *
 * Search by RST-id / Medusa display_id, filter by fulfillment status,
 * CSV-export the visible rows, and focus a specific order with
 * /b2b/orders?order=<id>. Totals come from Medusa V2 in MAJOR units (rupees),
 * not paise — no /100 conversion needed.
 */

type Order = {
  id: string;
  display_id: number | string;
  status: string;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  created_at: string;
  total: number;
  items?: Array<{ id: string; quantity?: number | null }> | null;
};

/**
 * A row in the unified history table. We surface both Medusa orders AND
 * customer-side purchase orders here so a buyer who just placed a PO via
 * /b2b/checkout finds it in the obvious place. PO rows have no Medusa
 * order linkage yet (they're either drafts awaiting payment capture, or
 * pre-order checkout artifacts), and their actions are tailored to that —
 * no invoice download or reorder, just View/Edit.
 */
type UnifiedRow = {
  kind: "order" | "po";
  id: string;
  /** Display label — RST-NNNNNN for orders, the PO number for POs. */
  label: string;
  /** Plain id used by search filter. */
  search_id: string;
  status: string;
  payment_status: string | null;
  created_at: string;
  total_major: number;
  item_count: number;
  /** PO-only — when an order has been linked downstream we show its id here. */
  linked_order_id: string | null;
};

function orderToRow(o: Order): UnifiedRow {
  return {
    kind: "order",
    id: o.id,
    label: `RST-${String(o.display_id).padStart(6, "0")}`,
    search_id: `${o.id} RST-${String(o.display_id).padStart(6, "0")}`,
    status: o.fulfillment_status ?? o.status ?? "—",
    payment_status: o.payment_status ?? null,
    created_at: o.created_at,
    total_major: Number(o.total ?? 0),
    item_count: (o.items ?? []).reduce((s, it) => s + Number(it.quantity ?? 0), 0),
    linked_order_id: null,
  };
}

function poToRow(p: DraftPurchaseOrder): UnifiedRow {
  return {
    kind: "po",
    id: p.id,
    label: p.po_number,
    search_id: `${p.id} ${p.po_number}`,
    status: p.status,
    payment_status: p.status === "draft" ? "pending" : null,
    created_at: p.created_at,
    total_major: Number(p.value_major ?? 0),
    item_count: 0,
    linked_order_id:
      // Older PO rows may carry a linked order id via the list endpoint's
      // `order` field; treat its presence as the upgrade trigger.
      (p as unknown as { order?: { id?: string } | null }).order?.id ?? null,
  };
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft (PO awaiting payment)" },
  { value: "in_progress", label: "In progress" },
  { value: "not_fulfilled", label: "Not fulfilled" },
  { value: "partially_fulfilled", label: "Partially fulfilled" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "canceled", label: "Cancelled" },
];

function statusBadgeTone(
  status: string | null | undefined,
): "success" | "danger" | "info" | "warning" | "neutral" {
  const s = (status ?? "").toLowerCase();
  if (s === "delivered" || s === "fulfilled") return "success";
  if (s === "canceled" || s === "cancelled") return "danger";
  if (s === "draft") return "warning";
  return "info";
}
function prettyStatus(s: string): string {
  return s.replace(/_/g, " ");
}
function downloadCsv(rows: UnifiedRow[]) {
  const header = ["Reference", "Type", "Placed", "Items", "Status", "Payment", "Total (INR)"];
  const lines = rows.map((r) => [
    r.label,
    r.kind === "order" ? "Order" : "Purchase Order",
    new Date(r.created_at).toISOString().slice(0, 10),
    String(r.item_count),
    prettyStatus(r.status),
    r.payment_status ?? "—",
    String(Math.round(r.total_major)),
  ]);
  const csv = [header, ...lines]
    .map((row) =>
      row
        .map((cell) =>
          /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell,
        )
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `risitex-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function InvoiceButton({
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
          // Errors are surfaced via the order detail page's download
          // button; on the list we keep the click silent on failure.
        } finally {
          setBusy(false);
        }
      }}
    >
      Invoice
    </Button>
  );
}

export default function B2bOrdersPage() {
  const searchParams = useSearchParams();
  const focusOrderId = searchParams?.get("order") ?? "";
  const [rows, setRows] = React.useState<UnifiedRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState(focusOrderId);
  const [status, setStatus] = React.useState<string>("all");

  React.useEffect(() => {
    if (focusOrderId) setQ(focusOrderId);
  }, [focusOrderId]);

  React.useEffect(() => {
    let cancelled = false;
    // Pull Medusa orders + customer POs in parallel. Either one failing
    // shouldn't blank the other — both branches `.catch(() => [])` so the
    // table still renders whatever data we have.
    Promise.all([
      medusa()
        .store.order.list({
          limit: 250,
          fields:
            "id,display_id,status,payment_status,fulfillment_status,created_at,total,items.id,items.quantity",
        } as Record<string, unknown>)
        .then((r) => ((r as { orders?: Order[] }).orders ?? []) as Order[])
        .catch((err: unknown) => {
          const msg = (err as Error).message ?? "";
          if (/401|Not authenticated/i.test(msg)) {
            // Signal auth failure through the error setter — the surrounding
            // empty state explains it. POs will also 401 in this case.
            if (!cancelled) {
              setError("Sign in to see your order history.");
            }
          }
          return [] as Order[];
        }),
      listAllPurchaseOrders().catch(() => [] as DraftPurchaseOrder[]),
    ])
      .then(([orderList, poList]) => {
        if (cancelled) return;
        // De-dup: when a PO has been promoted to a Medusa order
        // (`linked_order_id` set), the order row already represents it —
        // skip the PO row so we don't show it twice.
        const linkedOrderIds = new Set(
          poList
            .map((p) => (p as unknown as { order?: { id?: string } | null }).order?.id)
            .filter((id): id is string => !!id),
        );
        const orderRows = orderList.map(orderToRow);
        const poRows = poList
          .filter(
            (p) =>
              !(p as unknown as { order?: { id?: string } | null }).order?.id ||
              // Keep the PO row only if its linked order isn't in our order list
              // (rare race condition: PO was promoted but the order isn't
              // visible to the customer scope yet).
              !linkedOrderIds.has(
                (p as unknown as { order: { id: string } }).order.id,
              ) ||
              orderList.some((o) =>
                linkedOrderIds.has(o.id),
              ) === false,
          )
          .map(poToRow);
        const merged = [...orderRows, ...poRows].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setRows(merged);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load orders.");
        setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const all = rows ?? [];
  const filtered = all.filter((r) => {
    if (q) {
      const needle = q.toLowerCase();
      if (!r.search_id.toLowerCase().includes(needle)) {
        return false;
      }
    }
    if (status !== "all") {
      const want = status;
      const have = r.status.toLowerCase();
      if (have !== want) return false;
    }
    return true;
  });

  const totalSpend = filtered.reduce((s, r) => s + r.total_major, 0);
  const inProgress = all.filter((r) => {
    const s = r.status.toLowerCase();
    return (
      s !== "delivered" &&
      s !== "canceled" &&
      s !== "cancelled" &&
      s !== "" &&
      s !== "fulfilled"
    );
  }).length;
  const delivered = all.filter((r) => r.status.toLowerCase() === "delivered").length;
  const lifetimeSpend = all.reduce((s, r) => s + r.total_major, 0);

  const isLoading = rows === null && !error;

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title="Order history"
          subtitle="All B2B orders, with status and shipment"
          rightActions={
            <Button
              size="sm"
              variant="secondary"
              disabled={filtered.length === 0}
              onClick={() => downloadCsv(filtered)}
            >
              Export CSV
            </Button>
          }
        />
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      )}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total orders"
          value={isLoading ? "…" : all.length.toString()}
        />
        <StatCard
          label="In progress"
          value={isLoading ? "…" : inProgress.toString()}
        />
        <StatCard
          label="Delivered"
          value={isLoading ? "…" : delivered.toString()}
          tone="muted"
        />
        <StatCard
          label="Lifetime spend"
          value={isLoading ? "…" : formatINR(Math.round(lifetimeSpend))}
        />
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          leftAdornment={<Search className="h-4 w-4" />}
          placeholder="Search order id…"
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
          {filtered.length > 0
            ? ` · ${formatINR(Math.round(totalSpend))}`
            : ""}
        </span>
      </div>

      {isLoading ? (
        <p className="mt-8 text-body-md text-text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<ShoppingBag className="h-5 w-5" />}
            title={all.length === 0 ? "No orders yet" : "No matches"}
            description={
              all.length === 0
                ? "Your first wholesale order will appear here once it's placed."
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
                <th className="px-5 py-3 text-left">Reference</th>
                <th className="px-5 py-3 text-left">Type</th>
                <th className="px-5 py-3 text-left">Placed</th>
                <th className="px-5 py-3 text-left">Items</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Payment</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const detailHref = `/b2b/orders/${encodeURIComponent(r.id)}`;
                return (
                  <tr
                    key={`${r.kind}-${r.id}`}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-sunken transition-colors duration-fast"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={detailHref}
                        className="font-mono text-body-sm text-text-primary underline-offset-4 hover:underline"
                      >
                        {r.label}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={r.kind === "order" ? "info" : "warning"} size="xs">
                        {r.kind === "order" ? "Order" : "PO"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-body-sm text-text-secondary">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-body-sm text-text-secondary">
                      {r.item_count > 0 ? `${r.item_count} pcs` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={statusBadgeTone(r.status)} size="xs">
                        {prettyStatus(r.status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-body-sm text-text-secondary">
                      {r.payment_status ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-body-sm text-text-primary font-mono">
                      {formatINR(Math.round(r.total_major))}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-2">
                        {r.kind === "order" ? (
                          <>
                            <ReorderButton orderId={r.id} />
                            <InvoiceButton
                              orderId={r.id}
                              displayId={r.label.replace(/^RST-0*/, "")}
                            />
                          </>
                        ) : null}
                        <Button asChild size="xs" variant="tertiary">
                          <Link href={detailHref}>View</Link>
                        </Button>
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
