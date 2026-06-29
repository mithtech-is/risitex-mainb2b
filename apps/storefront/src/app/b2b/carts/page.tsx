"use client";

import * as React from "react";
import Link from "next/link";
import {
  Button,
  EmptyState,
  Badge,
} from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import {
  fetchB2BCartValidation,
  type CartValidation,
} from "@/lib/b2b-cart-validation";
import { ShippingGstEstimate } from "@/components/checkout/shipping-gst-estimate";

type SavedCart = {
  id: string;
  cart_id?: string | null;
  name: string;
  note?: string | null;
  item_count?: number;
  total_major?: number;
  updated_at?: string;
};

type DraftPO = {
  id: string;
  po_number: string;
  value_major: number;
  expected_payment_date: string | null;
  created_at: string;
  status: "draft" | "in_progress" | "fulfilled" | "cancelled";
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "x-publishable-api-key": PUB_KEY };
  if (typeof window !== "undefined") {
    const t = window.localStorage.getItem("medusa_auth_token");
    if (t) h.Authorization = `Bearer ${t}`;
  }
  return h;
}

export default function B2bCartPage() {
  const [savedCarts, setSavedCarts] = React.useState<SavedCart[]>([]);
  const [draftPOs, setDraftPOs] = React.useState<DraftPO[]>([]);
  const [validations, setValidations] = React.useState<
    Record<string, CartValidation | { error: string }>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedRes, poRes] = await Promise.all([
          fetch(`${MEDUSA_BASE_URL}/store/saved-carts`, {
            headers: authHeaders(),
            credentials: "include",
          }),
          fetch(`${MEDUSA_BASE_URL}/store/purchase-orders`, {
            headers: authHeaders(),
            credentials: "include",
          }),
        ]);
        const saved = savedRes.ok
          ? ((await savedRes.json()) as { saved_carts?: SavedCart[] })
              .saved_carts ?? []
          : [];
        const pos = poRes.ok
          ? ((await poRes.json()) as { purchase_orders?: DraftPO[] })
              .purchase_orders ?? []
          : [];
        if (cancelled) return;
        setSavedCarts(saved);
        setDraftPOs(pos.filter((p) => p.status === "draft"));

        // Fan out MOQ/case-pack validation against any saved cart that
        // carries a real Medusa cart_id. Each call is independent and any
        // 4xx is captured in-place so one cart's failure doesn't blank the
        // whole page.
        const vChecks = await Promise.all(
          saved
            .filter((c) => !!c.cart_id)
            .map(async (c) => {
              try {
                const v = await fetchB2BCartValidation(c.cart_id as string);
                return [c.id, v] as const;
              } catch (e) {
                return [
                  c.id,
                  { error: e instanceof Error ? e.message : "validation failed" },
                ] as const;
              }
            }),
        );
        if (!cancelled) {
          setValidations(Object.fromEntries(vChecks));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load cart");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cartTotalPaise = savedCarts.reduce(
    (sum, c) => sum + Math.round(Number(c.total_major ?? 0) * 100),
    0,
  );
  const draftTotalPaise = draftPOs.reduce(
    (sum, p) => sum + Math.round(Number(p.value_major ?? 0) * 100),
    0,
  );
  const grandTotalPaise = cartTotalPaise + draftTotalPaise;

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Cart" subtitle="Active baskets and draft POs" />
        <p
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="text-body-sm text-text-muted"
        >
          Loading your cart…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Cart" subtitle="" />
        <EmptyState
          title="Could not load cart"
          description={error}
          action={
            <Button asChild>
              <Link href="/wholesale/catalogue">Browse catalogue</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (savedCarts.length === 0 && draftPOs.length === 0) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title="Cart" subtitle="Active baskets and draft POs" />
        <EmptyState
          title="Your cart is empty"
          description="Save a cart from the matrix grid on any product, or draft a Purchase Order."
          action={
            <div className="flex gap-3">
              <Button asChild>
                <Link href="/wholesale/catalogue">Browse catalogue</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/b2b/purchase-orders/new">New PO</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Cart"
        subtitle={`${savedCarts.length} saved cart${savedCarts.length === 1 ? "" : "s"} · ${draftPOs.length} draft PO${draftPOs.length === 1 ? "" : "s"}`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-4">
          {savedCarts.length > 0 && (
            <div>
              <h2 className="text-heading-sm text-text-primary">Saved carts</h2>
              <ul className="mt-3 space-y-3">
                {savedCarts.map((c) => {
                  const v = validations[c.id];
                  const ok = v && "ok" in v ? v.ok : null;
                  return (
                    <li
                      key={c.id}
                      className="rounded-md border border-border-subtle bg-surface-raised p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-body-md font-medium text-text-primary">
                            {c.name || c.id}
                          </p>
                          {c.note && (
                            <p className="mt-1 text-caption text-text-muted">
                              {c.note}
                            </p>
                          )}
                          <p className="mt-2 text-caption text-text-muted">
                            {c.item_count ?? 0} items
                            {typeof c.total_major === "number"
                              ? ` · ₹${c.total_major.toLocaleString("en-IN")}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {ok === true && (
                            <Badge tone="success">MOQ &amp; case-pack OK</Badge>
                          )}
                          {ok === false && (
                            <Badge tone="warning">
                              {(v as CartValidation).violations.length} violations
                            </Badge>
                          )}
                          {v && "error" in v && (
                            <Badge tone="info">Validation pending</Badge>
                          )}
                          <Button asChild size="sm">
                            <Link
                              href={`/b2b/purchase-orders/new?value=${Math.max(
                                1,
                                Math.round(Number(c.total_major ?? 1)),
                              )}&product=${encodeURIComponent(
                                c.name || "Saved cart",
                              )}`}
                            >
                              Convert to PO
                            </Link>
                          </Button>
                        </div>
                      </div>
                      {ok === false && (
                        <ul className="mt-3 space-y-1 border-t border-border-subtle pt-3 text-caption text-feedback-warning-text">
                          {(v as CartValidation).violations.slice(0, 4).map((vio, i) => (
                            <li key={i}>• {vio.message}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {draftPOs.length > 0 && (
            <div>
              <h2 className="text-heading-sm text-text-primary">Draft POs</h2>
              <ul className="mt-3 space-y-3">
                {draftPOs.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface-raised p-4"
                  >
                    <div>
                      <p className="text-body-md font-medium text-text-primary">
                        {p.po_number}
                      </p>
                      <p className="mt-1 text-caption text-text-muted">
                        ₹{Number(p.value_major).toLocaleString("en-IN")}
                        {p.expected_payment_date
                          ? ` · pay by ${new Date(p.expected_payment_date).toLocaleDateString("en-IN")}`
                          : ""}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/b2b/purchase-orders?focus=${p.id}`}>
                        Open
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside aria-label="Cart totals and estimate" className="space-y-4">
          <div className="rounded-md border border-border-subtle bg-surface-raised p-5">
            <h2 className="text-heading-sm text-text-primary">Total committed</h2>
            <p className="mt-2 font-mono text-display-sm text-text-primary">
              ₹{Math.round(grandTotalPaise / 100).toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-caption text-text-muted">
              Across saved carts &amp; draft POs (excludes shipping + GST).
            </p>
            <Button asChild className="mt-4 w-full">
              <Link href="/b2b/purchase-orders/new">Create new PO</Link>
            </Button>
          </div>

          {grandTotalPaise > 0 && (
            <ShippingGstEstimate subtotalPaise={grandTotalPaise} />
          )}
        </aside>
      </div>
    </div>
  );
}
