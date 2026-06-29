"use client";

import * as React from "react";
import Link from "next/link";
import { Button, EmptyState, formatINR } from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { listStoreOrders, type StoreOrder } from "@/lib/orders";

type Suggestion = {
  title: string;
  quantity: number;
  orderCount: number;
  spend: number;
};

function buildSuggestions(orders: StoreOrder[]): Suggestion[] {
  const byTitle = new Map<string, Suggestion>();
  for (const order of orders) {
    for (const item of order.items ?? []) {
      const title = item.title ?? "Wholesale SKU";
      const current =
        byTitle.get(title) ??
        ({ title, quantity: 0, orderCount: 0, spend: 0 } satisfies Suggestion);
      current.quantity += Number(item.quantity ?? 0);
      current.orderCount += 1;
      current.spend +=
        Number(item.quantity ?? 0) * Number(item.unit_price ?? 0);
      byTitle.set(title, current);
    }
  }
  return [...byTitle.values()]
    .sort((a, b) => b.quantity - a.quantity || b.spend - a.spend)
    .slice(0, 8);
}

export default function AiReordersPage() {
  const [state, setState] = React.useState<{
    loading: boolean;
    error: string | null;
    suggestions: Suggestion[];
  }>({ loading: true, error: null, suggestions: [] });

  React.useEffect(() => {
    let cancelled = false;
    listStoreOrders(250)
      .then((orders) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            suggestions: buildSuggestions(orders),
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            error:
              err instanceof Error
                ? err.message
                : "Could not generate reorder suggestions",
            suggestions: [],
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
        title="AI Reorders"
        subtitle="Demand-aware replenishment suggestions from order history"
      />
      {state.loading && (
        <div className="rounded-md border border-border-subtle bg-surface-raised p-6">
          <p className="text-body-sm text-text-muted">
            Analysing previous wholesale orders...
          </p>
        </div>
      )}
      {state.error && (
        <EmptyState title="Could not build suggestions" description={state.error} />
      )}
      {!state.loading && !state.error && state.suggestions.length === 0 && (
        <EmptyState
          title="No reorder signals yet"
          description="AI reorder suggestions unlock after your first wholesale orders include line items."
          action={
            <Button asChild>
              <Link href="/products">Open catalogue</Link>
            </Button>
          }
        />
      )}
      {!state.loading && !state.error && state.suggestions.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {state.suggestions.map((item) => {
            const params = new URLSearchParams({
              productName: item.title,
              quantity: String(Math.max(item.quantity, 1)),
              value: String(Math.max(Math.round(item.spend), 1)),
            });
            return (
              <article
                key={item.title}
                className="rounded-md border border-border-subtle bg-surface-raised p-5"
              >
                <p className="text-micro text-text-muted">
                  {item.orderCount} prior line{item.orderCount === 1 ? "" : "s"}
                </p>
                <h2 className="mt-2 text-heading-sm text-text-primary">
                  {item.title}
                </h2>
                <p className="mt-2 text-body-sm text-text-secondary">
                  Recommended draft quantity:{" "}
                  <span className="font-mono text-text-primary">
                    {item.quantity}
                  </span>{" "}
                  pcs, historical value {formatINR(Math.round(item.spend))}
                </p>
                <Button asChild size="sm" className="mt-4">
                  <Link href={`/b2b/purchase-orders/new?${params.toString()}`}>
                    Create reorder PO
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
