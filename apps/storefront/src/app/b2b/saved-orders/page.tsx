"use client";

import * as React from "react";
import Link from "next/link";
import { Button, EmptyState } from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";

type SavedCart = {
  id: string;
  name: string;
  note?: string | null;
  item_count?: number;
  total_major?: number;
  updated_at?: string;
};

export default function SavedOrdersPage() {
  const [state, setState] = React.useState<{
    loading: boolean;
    error: string | null;
    saved: SavedCart[];
  }>({ loading: true, error: null, saved: [] });

  React.useEffect(() => {
    let cancelled = false;
    const token = window.localStorage.getItem("medusa_auth_token");
    const headers: Record<string, string> = {
      "x-publishable-api-key":
        process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(`${MEDUSA_BASE_URL}/store/saved-carts`, {
      headers,
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Saved orders failed (${res.status})`);
        return (await res.json()) as { saved_carts?: SavedCart[] };
      })
      .then((body) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            saved: body.saved_carts ?? [],
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            error:
              err instanceof Error ? err.message : "Could not load saved orders",
            saved: [],
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
        title="Saved Orders"
        subtitle="Reusable wholesale baskets and buyer shortlists"
      />
      {state.loading && (
        <div className="rounded-md border border-border-subtle bg-surface-raised p-6">
          <p className="text-body-sm text-text-muted">Loading saved orders...</p>
        </div>
      )}
      {state.error && (
        <EmptyState title="Could not load saved orders" description={state.error} />
      )}
      {!state.loading && !state.error && state.saved.length === 0 && (
        <EmptyState
          title="No saved orders yet"
          description="Save a wholesale cart to reuse it later or share it with your team."
          action={
            <Button asChild>
              <Link href="/products">Open catalogue</Link>
            </Button>
          }
        />
      )}
      {!state.loading && !state.error && state.saved.length > 0 && (
        <div className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface-raised">
          {state.saved.map((cart) => (
            <article
              key={cart.id}
              className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <h2 className="text-body-md font-medium text-text-primary">
                  {cart.name}
                </h2>
                <p className="mt-1 text-body-sm text-text-muted">
                  {cart.item_count ?? 0} pcs - Rs{" "}
                  {(cart.total_major ?? 0).toLocaleString("en-IN")}
                </p>
                {cart.note && (
                  <p className="mt-1 text-caption text-text-muted">{cart.note}</p>
                )}
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href="/b2b/carts">Open cart workspace</Link>
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
