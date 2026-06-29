"use client";

import * as React from "react";
import Link from "next/link";
import { Button, EmptyState, formatINR } from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { listStoreOrders, type StoreOrder } from "@/lib/orders";

function orderUnits(order: StoreOrder) {
  return (order.items ?? []).reduce(
    (sum, item) => sum + Number(item.quantity ?? 0),
    0,
  );
}

export default function BulkReorderPage() {
  const [state, setState] = React.useState<{
    loading: boolean;
    error: string | null;
    orders: StoreOrder[];
  }>({ loading: true, error: null, orders: [] });

  React.useEffect(() => {
    let cancelled = false;
    listStoreOrders(100)
      .then((orders) => {
        if (!cancelled) setState({ loading: false, error: null, orders });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: err instanceof Error ? err.message : "Could not load orders",
            orders: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Bulk Reorder"
        subtitle="Repeat previous wholesale orders as purchase order drafts"
      />
      {state.loading && (
        <div className="rounded-md border border-border-subtle bg-surface-raised p-6">
          <p className="text-body-sm text-text-muted">Loading reorder history...</p>
        </div>
      )}
      {state.error && (
        <EmptyState title="Could not load reorder history" description={state.error} />
      )}
      {!state.loading && !state.error && state.orders.length === 0 && (
        <EmptyState
          title="No orders to reorder yet"
          description="Completed wholesale orders will appear here for fast bulk reordering."
          action={
            <Button asChild>
              <Link href="/products">Open catalogue</Link>
            </Button>
          }
        />
      )}
      {!state.loading && !state.error && state.orders.length > 0 && (
        <div className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface-raised">
          {state.orders.map((order) => {
            const units = orderUnits(order);
            const params = new URLSearchParams({
              productName: `RST-${String(order.display_id).padStart(6, "0")}`,
              quantity: String(Math.max(units, 1)),
              value: String(Math.max(Math.round(Number(order.total ?? 0)), 1)),
            });
            return (
              <article
                key={order.id}
                className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <h2 className="font-mono text-body-md text-text-primary">
                    RST-{String(order.display_id).padStart(6, "0")}
                  </h2>
                  <p className="mt-1 text-body-sm text-text-muted">
                    {units} pcs - {formatINR(Math.round(Number(order.total ?? 0)))} -{" "}
                    {new Date(order.created_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/b2b/purchase-orders/new?${params.toString()}`}>
                    Reorder
                  </Link>
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
