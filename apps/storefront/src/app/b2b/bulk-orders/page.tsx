"use client";

import * as React from "react";
import Link from "next/link";
import { Button, EmptyState, Input, formatINR } from "@risitex/ui/components";
import { Search, Package2 } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { medusa, MEDUSA_BASE_URL } from "@/lib/medusa";
import { getRegionId } from "@/lib/region";

/**
 * /b2b/bulk-orders — every past order with BULK_THRESHOLD+ total units.
 * Each line shows live stock; "Reorder in-stock" pushes only the lines
 * that are currently available back into the cart.
 */

const BULK_THRESHOLD = 30;
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

type OrderItem = {
  id: string;
  variant_id?: string | null;
  variant_sku?: string | null;
  title?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  subtotal?: number | null;
};
type Order = {
  id: string;
  display_id?: number | null;
  created_at: string;
  status?: string | null;
  fulfillment_status?: string | null;
  total?: number | null;
  items?: OrderItem[] | null;
};
type BulkLine = {
  variantId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  inStock: boolean;
};
type BulkOrderRow = {
  id: string;
  displayId: string;
  createdAt: string;
  totalPcs: number;
  totalAmount: number;
  items: BulkLine[];
};

async function fetchOrders(): Promise<Order[]> {
  const r = await medusa().store.order.list({
    limit: 250,
    fields:
      "id,display_id,status,fulfillment_status,created_at,total," +
      "items.id,items.variant_id,items.variant_sku,items.title,items.quantity,items.unit_price,items.subtotal",
  } as Record<string, unknown>);
  return (r as { orders?: Order[] }).orders ?? [];
}

async function fetchInStockSet(): Promise<Set<string> | null> {
  const regionId = await getRegionId();
  const params = new URLSearchParams({
    limit: "100",
    fields: "id,*variants,variants.inventory_quantity",
  });
  if (regionId) params.set("region_id", regionId);
  try {
    const res = await fetch(`${MEDUSA_BASE_URL}/store/products?${params}`, {
      headers: { "x-publishable-api-key": PUB_KEY },
      cache: "no-store",
    });
    if (!res.ok) return null; // unknown → treat all as available
    const body = (await res.json()) as {
      products?: Array<{
        variants?: Array<{
          id: string;
          inventory_quantity?: number | null;
          manage_inventory?: boolean | null;
        }>;
      }>;
    };
    const inStock = new Set<string>();
    for (const p of body.products ?? []) {
      for (const v of p.variants ?? []) {
        // If inventory isn't managed, the SKU is always sellable.
        if (v.manage_inventory === false || (v.inventory_quantity ?? 1) > 0) {
          inStock.add(v.id);
        }
      }
    }
    return inStock;
  } catch {
    return null;
  }
}

function toBulkRows(
  orders: Order[],
  inStock: Set<string> | null,
): BulkOrderRow[] {
  return orders
    .map((o) => {
      const items: BulkLine[] = (o.items ?? [])
        .filter((i) => Number(i.quantity ?? 0) > 0)
        .map((i) => {
          const variantId = i.variant_id ?? i.id;
          const qty = Number(i.quantity ?? 0);
          return {
            variantId,
            sku: i.variant_sku ?? variantId,
            title: i.title ?? "Unknown",
            quantity: qty,
            unitPrice: Number(
              i.unit_price ??
                (i.subtotal != null ? Number(i.subtotal) / Math.max(qty, 1) : 0),
            ),
            // No stock data → optimistic (treat as in stock).
            inStock: inStock === null ? true : inStock.has(variantId),
          };
        });
      const totalPcs = items.reduce((s, i) => s + i.quantity, 0);
      return {
        id: o.id,
        displayId: `RST-${o.display_id ?? o.id.slice(-6)}`,
        createdAt: o.created_at,
        totalPcs,
        totalAmount:
          Number(o.total ?? 0) ||
          items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
        items,
      };
    })
    .filter((o) => o.totalPcs >= BULK_THRESHOLD)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

function navigateToPo(items: { variantId: string; quantity: number }[]) {
  const params = new URLSearchParams();
  for (const it of items) {
    params.append("variant", `${it.variantId}:${it.quantity}`);
  }
  window.location.href = `/b2b/purchase-orders/new?${params.toString()}`;
}

export default function BulkOrdersPage() {
  const [rows, setRows] = React.useState<BulkOrderRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchOrders(),
      fetchInStockSet().catch(() => null),
    ])
      .then(([orders, inStock]) => {
        if (!cancelled) setRows(toBulkRows(orders, inStock));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = (err as Error).message ?? "";
        setError(
          /401|Not authenticated/i.test(msg)
            ? "Sign in to view bulk orders."
            : "Couldn't load orders.",
        );
        setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (rows ?? []).filter(
    (o) =>
      !q ||
      o.displayId.toLowerCase().includes(q.toLowerCase()) ||
      o.items.some((i) => i.title.toLowerCase().includes(q.toLowerCase())),
  );

  const handleReorderAll = (row: BulkOrderRow) => {
    const items = row.items
      .filter((i) => i.inStock)
      .map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
      }));
    navigateToPo(items);
  };

  const isLoading = rows === null && !error;

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title="Bulk orders"
          subtitle={`Past orders of ${BULK_THRESHOLD}+ units — reorder what's in stock`}
        />
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      )}

      <div className="mb-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          leftAdornment={<Search className="h-4 w-4" />}
          placeholder="Search order ID or product…"
          className="max-w-md"
        />
      </div>

      {isLoading ? (
        <p className="py-12 text-body-md text-text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package2 className="h-5 w-5" />}
          title="No bulk orders yet"
          description={`Orders with ${BULK_THRESHOLD} or more units appear here for one-click reorder.`}
          action={
            <Button asChild>
              <Link href="/wholesale/catalogue">Browse catalogue</Link>
            </Button>
          }
          className="mt-4"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border border-border-subtle bg-surface-raised"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-body-sm font-medium text-text-primary">
                    {order.displayId}
                  </span>
                  <span className="text-caption text-text-muted">
                    {new Date(order.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-micro text-text-secondary">
                    {order.totalPcs.toLocaleString()} pcs
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-body-sm font-medium text-text-primary">
                    {formatINR(Math.round(order.totalAmount))}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleReorderAll(order)}
                    disabled={order.items.every((i) => !i.inStock)}
                  >
                    Reorder in-stock
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-border-subtle">
                {order.items.map((item) => (
                  <div
                    key={`${order.id}-${item.variantId}`}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm text-text-primary">
                        {item.title}
                      </p>
                      <p className="font-mono text-caption text-text-muted">
                        {item.sku}
                      </p>
                    </div>
                    <span className="text-body-sm text-text-secondary">
                      {item.quantity.toLocaleString()} pcs
                    </span>
                    <span className="hidden text-body-sm text-text-secondary sm:inline">
                      {formatINR(Math.round(item.unitPrice))} / pc
                    </span>
                    <span
                      className={
                        "text-caption " +
                        (item.inStock
                          ? "text-feedback-success-text"
                          : "text-feedback-error-text")
                      }
                    >
                      {item.inStock ? "In stock" : "Out of stock"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
