"use client";

import * as React from "react";
import Link from "next/link";
import {
  Button,
  EmptyState,
  Input,
  formatINR,
} from "@risitex/ui/components";
import { History, Search } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { medusa, MEDUSA_BASE_URL } from "@/lib/medusa";
import { getRegionId } from "@/lib/region";
import {
  listAllPurchaseOrders,
  type DraftPurchaseOrder,
} from "@/lib/purchase-orders";

/**
 * /b2b/reorder — Quick reorder shows the customer's actual past orders
 * as cards. Each card lists its line items and offers:
 *   - "Reorder all" — pushes every line back into the cart
 *   - per-line "Add" — pushes a single line back
 *
 * Quantities are restored at max(last ordered qty, MOQ). Order cards are
 * sorted newest first. This replaced the earlier flat variant list, which
 * hid which order a SKU came from.
 */

type ProductVariant = {
  id: string;
  sku?: string | null;
  title?: string | null;
  calculated_price?: { calculated_amount?: number } | null;
  options?: Array<{
    value?: string | null;
    option?: { title?: string | null } | null;
  }> | null;
  metadata?: Record<string, unknown> | null;
};
type Product = {
  id: string;
  title: string;
  handle: string;
  thumbnail?: string | null;
  options?: Array<{
    title?: string | null;
    values?: Array<{ value?: string | null }> | null;
  }> | null;
  variants?: ProductVariant[] | null;
  metadata?: Record<string, unknown> | null;
};
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
  total?: number | null;
  items?: OrderItem[] | null;
};

type OrderLine = {
  variantId: string;
  sku: string;
  productHandle: string;
  productName: string;
  variantLabel: string;
  swatchHex: string;
  unitPriceMajor: number;
  quantity: number;
  moq: number;
};
type OrderWithDetail = {
  id: string;
  displayId: string;
  createdAt: string;
  totalMajor: number;
  totalPcs: number;
  items: OrderLine[];
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

const SWATCH_MAP: Record<string, string> = {
  natural: "#F1ECDF",
  white: "#F7F4EE",
  indigo: "#2A3F7A",
  olive: "#5C6438",
  ink: "#0F0F0D",
  khadi: "#F1ECDF",
  charcoal: "#3F3F38",
  madder: "#A14826",
  sage: "#5C8C50",
};

async function fetchProductsRaw(): Promise<Product[]> {
  const regionId = await getRegionId();
  const params = new URLSearchParams({
    limit: "100",
    fields:
      "id,title,handle,thumbnail,metadata," +
      "*variants,*variants.options,*variants.options.option," +
      "*variants.calculated_price",
  });
  if (regionId) params.set("region_id", regionId);
  const res = await fetch(`${MEDUSA_BASE_URL}/store/products?${params}`, {
    headers: { "x-publishable-api-key": PUB_KEY },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`backend ${res.status}`);
  const body = (await res.json()) as { products?: Product[] };
  return body.products ?? [];
}

function variantOption(
  v: ProductVariant,
  title: "size" | "colour" | "color",
): string | null {
  const found = (v.options ?? []).find(
    (o) => (o?.option?.title ?? "").toLowerCase() === title.toLowerCase(),
  );
  return found?.value ?? null;
}
function variantLabelOf(v: ProductVariant): string {
  if (v.title && v.title.trim()) return v.title.trim();
  const size = variantOption(v, "size");
  const colour = variantOption(v, "colour") ?? variantOption(v, "color") ?? null;
  return [size, colour].filter(Boolean).join(" · ") || "Default";
}
function swatchOf(v: ProductVariant): string {
  const colour = variantOption(v, "colour") ?? variantOption(v, "color") ?? null;
  if (!colour) return "#A0978A";
  return SWATCH_MAP[colour.toLowerCase()] ?? "#A0978A";
}
function moqOf(v: ProductVariant, p: Product): number {
  const meta = (v.metadata ?? p.metadata ?? {}) as Record<string, unknown>;
  const m = meta.moq;
  if (typeof m === "number" && m > 0) return Math.floor(m);
  if (typeof m === "string") {
    const n = Number(m);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 1;
}

function buildOrderDetails(
  products: Product[],
  orders: Order[],
): OrderWithDetail[] {
  const variantToProduct = new Map<string, { p: Product; v: ProductVariant }>();
  for (const p of products) {
    for (const v of p.variants ?? []) {
      variantToProduct.set(v.id, { p, v });
    }
  }

  const result: OrderWithDetail[] = [];
  for (const o of orders) {
    const items: OrderLine[] = [];
    for (const it of o.items ?? []) {
      const vId = it.variant_id;
      if (!vId) continue;
      const qty = Number(it.quantity ?? 0);
      if (qty <= 0) continue;
      const lookup = variantToProduct.get(vId);
      const calc = lookup?.v.calculated_price?.calculated_amount;
      const unit =
        typeof calc === "number"
          ? calc
          : Number(
              it.unit_price ??
                (it.subtotal != null && qty > 0
                  ? Number(it.subtotal) / qty
                  : 0),
            );
      items.push({
        variantId: vId,
        sku: lookup?.v.sku ?? it.variant_sku ?? vId,
        productHandle: lookup?.p.handle ?? vId,
        productName: lookup?.p.title ?? it.title ?? "Unknown product",
        variantLabel: lookup ? variantLabelOf(lookup.v) : it.title ?? "Default",
        swatchHex: lookup ? swatchOf(lookup.v) : "#A0978A",
        unitPriceMajor: unit,
        quantity: qty,
        moq: lookup ? moqOf(lookup.v, lookup.p) : 1,
      });
    }
    if (items.length === 0) continue;
    result.push({
      id: o.id,
      displayId: `RST-${o.display_id ?? o.id.slice(-6)}`,
      createdAt: o.created_at,
      totalMajor:
        Number(o.total ?? 0) ||
        items.reduce((s, i) => s + i.unitPriceMajor * i.quantity, 0),
      totalPcs: items.reduce((s, i) => s + i.quantity, 0),
      items,
    });
  }
  return result.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function navigateToPo(
  items: { variantId: string; quantity: number }[],
) {
  const params = new URLSearchParams();
  for (const it of items) {
    params.append("variant", `${it.variantId}:${it.quantity}`);
  }
  window.location.href = `/b2b/purchase-orders/new?${params.toString()}`;
}

export default function B2bReorderPage() {
  const [products, setProducts] = React.useState<Product[] | null>(null);
  const [orders, setOrders] = React.useState<Order[] | null>(null);
  // POs the buyer placed via /b2b/checkout. Their line items aren't
  // structured (only a free-text snapshot lives in metadata.notes), so
  // we can't expand them to variant-level "Reorder all" actions like we
  // do for Medusa orders. Instead the PO section offers "Place similar
  // PO" which seeds the checkout wizard with the prior PO's value.
  const [pos, setPos] = React.useState<DraftPurchaseOrder[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchProductsRaw().catch(() => [] as Product[]),
      medusa()
        .store.order.list({
          limit: 200,
          fields:
            "id,display_id,created_at,total,items.id,items.variant_id,items.variant_sku,items.title,items.quantity,items.unit_price,items.subtotal",
        } as Record<string, unknown>)
        .then((r) => (r as { orders?: Order[] }).orders ?? [])
        .catch((err: unknown) => {
          const msg = (err as Error).message ?? "";
          if (/401|Not authenticated/i.test(msg)) throw err;
          return [] as Order[];
        }),
      listAllPurchaseOrders().catch(() => [] as DraftPurchaseOrder[]),
    ])
      .then(([ps, os, poList]) => {
        if (cancelled) return;
        setProducts(ps);
        setOrders(os);
        setPos(poList);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = (err as Error).message ?? "";
        setError(
          /401|Not authenticated/i.test(msg)
            ? "Sign in to see your order history."
            : msg || "Couldn't load orders.",
        );
        setProducts([]);
        setOrders([]);
        setPos([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const orderDetails = React.useMemo(
    () => buildOrderDetails(products ?? [], orders ?? []),
    [products, orders],
  );

  const filtered = orderDetails.filter(
    (o) =>
      !q ||
      o.displayId.toLowerCase().includes(q.toLowerCase()) ||
      o.items.some(
        (i) =>
          i.productName.toLowerCase().includes(q.toLowerCase()) ||
          i.sku.toLowerCase().includes(q.toLowerCase()),
      ),
  );

  const addLine = (it: OrderLine) => {
    navigateToPo([
      { variantId: it.variantId, quantity: Math.max(it.quantity, it.moq) },
    ]);
  };

  const handleReorderAll = (order: OrderWithDetail) => {
    const items = order.items.map((it) => ({
      variantId: it.variantId,
      quantity: Math.max(it.quantity, it.moq),
    }));
    navigateToPo(items);
  };

  const isLoading =
    (products === null || orders === null || pos === null) && !error;
  // POs sorted newest first; match the search box on po_number.
  const filteredPOs = (pos ?? [])
    .filter(
      (p) =>
        !q ||
        p.po_number.toLowerCase().includes(q.toLowerCase()) ||
        p.id.toLowerCase().includes(q.toLowerCase()),
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title="Quick reorder"
          subtitle="Repeat a past order in one click"
        />
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      )}

      <div className="mb-4 flex items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          leftAdornment={<Search className="h-4 w-4" />}
          placeholder="Search by order ID or product…"
          className="max-w-md"
        />
      </div>

      {!isLoading && filteredPOs.length > 0 && (
        <section aria-label="Recent purchase orders" className="mb-6">
          <h2 className="mb-2 text-heading-sm text-text-primary">
            Recent purchase orders
          </h2>
          <p className="mb-3 text-caption text-text-muted">
            POs you placed via checkout. We can't auto-expand the line items
            (the order ships once payment is confirmed), but you can open the
            PO or draft a similar one with the same value.
          </p>
          <ul className="space-y-2">
            {filteredPOs.slice(0, 8).map((p) => {
              const paid = !!p.payment_confirmed_at;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface-raised p-4"
                >
                  <div>
                    <p className="font-mono text-body-sm text-text-primary">
                      {p.po_number}
                    </p>
                    <p className="mt-0.5 text-caption text-text-muted">
                      {formatINR(p.value_major)} · placed{" "}
                      {new Date(p.created_at).toLocaleDateString("en-IN")}
                      {paid && " · payment confirmed"}
                    </p>
                  </div>
                  <div className="inline-flex gap-2">
                    <Button asChild size="xs" variant="tertiary">
                      <Link href={`/b2b/purchase-orders/${encodeURIComponent(p.id)}`}>
                        View PO
                      </Link>
                    </Button>
                    <Button asChild size="xs">
                      <Link
                        href={`/b2b/checkout?product=${encodeURIComponent(p.po_number)}&value=${p.value_major}`}
                      >
                        Place similar
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {isLoading ? (
        <p className="py-12 text-body-md text-text-muted">Loading…</p>
      ) : filtered.length === 0 && filteredPOs.length === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title="No orders yet"
          description="Once you've placed a wholesale order it lands here for one-click reordering."
          action={
            <Button asChild>
              <Link href="/wholesale/catalogue">Open catalogue</Link>
            </Button>
          }
          className="mt-4"
        />
      ) : filtered.length === 0 ? (
        // POs exist but no fulfilled orders yet — keep the PO section above
        // and tell the buyer where structured one-click reorder will appear.
        <p className="mt-4 rounded-md border border-border-subtle bg-surface-sunken p-5 text-body-sm text-text-muted">
          Structured one-click reorder unlocks once your purchase orders are
          paid + dispatched. Until then, draft a similar PO using the buttons
          above.
        </p>
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
                    {formatINR(Math.round(order.totalMajor))}
                  </span>
                  <Button size="sm" onClick={() => handleReorderAll(order)}>
                    Reorder all
                  </Button>
                </div>
              </div>
              <div className="divide-y divide-border-subtle">
                {order.items.map((item) => (
                  <div
                    key={`${order.id}-${item.variantId}`}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <div
                      className="h-6 w-6 flex-shrink-0 rounded ring-1 ring-border-subtle"
                      style={{ background: item.swatchHex }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm text-text-primary">
                        {item.productName}
                      </p>
                      <p className="text-caption text-text-muted">
                        {item.variantLabel}
                      </p>
                    </div>
                    <span className="hidden font-mono text-caption text-text-muted sm:inline">
                      {item.sku}
                    </span>
                    <span className="text-body-sm text-text-secondary">
                      {item.quantity.toLocaleString()} pcs
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => addLine(item)}
                    >
                      Add
                    </Button>
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
