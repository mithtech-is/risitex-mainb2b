"use client";

import * as React from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  StatCard,
  Input,
  TrendChart,
  formatINR,
} from "@risitex/ui/components";
import { Package, Search } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { medusa } from "@/lib/medusa";
import { getRegionId } from "@/lib/region";
import { fetchAvailability, type AvailabilityRow } from "@/lib/availability";

/**
 * /b2b/inventory — live read of catalog stock crossed with the
 * customer's own buying history.
 *
 * What's shown per variant:
 *   - SKU + product / option labels
 *   - Available stock (physical − reserved) from the B2B availability
 *     endpoint (FR-9.02); falls back to variant.inventory_quantity if the
 *     endpoint is unavailable. "Unmanaged" when manage_inventory is false.
 *   - Customer's last-90-days bought qty + a 14-week trend
 *   - Status pill: in_stock / low_stock / out_of_stock / unmanaged
 *
 * Sort: out-of-stock + low first (the SKUs the customer needs to act
 * on), then alpha by product title.
 *
 * Intentionally drops the old "AI forecast" pretence — we don't have
 * a forecasting model wired up. The 14-week trend is real (past buy
 * history), not a forecast.
 */

type ProductVariant = {
  id: string;
  sku?: string | null;
  title?: string | null;
  manage_inventory?: boolean | null;
  inventory_quantity?: number | null;
  calculated_price?: { calculated_amount?: number } | null;
  options?: Array<{
    value?: string | null;
    option?: { title?: string | null } | null;
  }> | null;
};
type Product = {
  id: string;
  title: string;
  handle: string;
  thumbnail?: string | null;
  variants?: ProductVariant[] | null;
};
type OrderItem = {
  id: string;
  variant_id?: string | null;
  variant_sku?: string | null;
  quantity?: number | null;
};
type Order = {
  id: string;
  created_at: string;
  items?: OrderItem[] | null;
};
type Row = {
  variantId: string;
  sku: string;
  productHandle: string;
  productTitle: string;
  variantTitle: string;
  unitPriceMajor: number | null;
  state: "out_of_stock" | "low_stock" | "in_stock" | "unmanaged";
  stock: number | null;
  bought90: number;
  weeklyTrend: number[];
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

async function fetchProductsRaw(): Promise<Product[]> {
  const regionId = await getRegionId();
  const params = new URLSearchParams({
    limit: "100",
    fields:
      "id,title,handle,thumbnail," +
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

function variantTitle(v: ProductVariant): string {
  if (v.title && v.title.trim()) return v.title.trim();
  const opts = (v.options ?? [])
    .map((o) => o?.value)
    .filter((s): s is string => !!s);
  return opts.length > 0 ? opts.join(" · ") : "Default";
}
function stateFromQty(q: number | null): Row["state"] {
  if (q == null) return "unmanaged";
  if (q <= 0) return "out_of_stock";
  if (q <= 10) return "low_stock";
  return "in_stock";
}

const STATE_TONE: Record<
  Row["state"],
  "success" | "warning" | "danger" | "info"
> = {
  in_stock: "success",
  low_stock: "warning",
  out_of_stock: "danger",
  unmanaged: "info",
};
const STATE_LABEL: Record<Row["state"], string> = {
  in_stock: "In stock",
  low_stock: "Low",
  out_of_stock: "Out of stock",
  unmanaged: "Unmanaged",
};

function buildRows(
  products: Product[],
  orders: Order[],
  availability: Map<string, AvailabilityRow>,
): Row[] {
  // Customer velocity per variant_id — total qty in last 90 days and
  // weekly buckets over the last 14 weeks.
  const now = Date.now();
  const ninety = now - 90 * 86_400_000;
  const weekMs = 7 * 86_400_000;
  const fourteenWeeks = now - 14 * weekMs;
  const buy90 = new Map<string, number>();
  const trend = new Map<string, number[]>();
  for (const o of orders) {
    const t = new Date(o.created_at).getTime();
    if (Number.isNaN(t)) continue;
    if (t < fourteenWeeks) continue;
    const weekIdx = Math.min(
      13,
      Math.max(0, Math.floor((t - fourteenWeeks) / weekMs)),
    );
    for (const it of o.items ?? []) {
      const vId = it.variant_id;
      if (!vId) continue;
      const qty = Number(it.quantity ?? 0);
      if (t >= ninety) {
        buy90.set(vId, (buy90.get(vId) ?? 0) + qty);
      }
      const arr = trend.get(vId) ?? new Array(14).fill(0);
      arr[weekIdx] = (arr[weekIdx] ?? 0) + qty;
      trend.set(vId, arr);
    }
  }

  const rows: Row[] = [];
  for (const p of products) {
    for (const v of p.variants ?? []) {
      // FR-9.02: show Available (physical − reserved) to MBOs. Prefer the
      // availability endpoint; fall back to the variant's physical quantity
      // when it isn't present (older backend / unmapped SKU).
      const avail = v.sku ? availability.get(v.sku) : undefined;
      const stock =
        v.manage_inventory === false
          ? null
          : avail
            ? avail.available
            : Number(v.inventory_quantity ?? 0);
      const state = stateFromQty(stock);
      const calc = v.calculated_price?.calculated_amount;
      rows.push({
        variantId: v.id,
        sku: v.sku ?? v.id,
        productHandle: p.handle,
        productTitle: p.title,
        variantTitle: variantTitle(v),
        unitPriceMajor: typeof calc === "number" ? calc : null,
        state,
        stock,
        bought90: buy90.get(v.id) ?? 0,
        weeklyTrend: trend.get(v.id) ?? new Array(14).fill(0),
      });
    }
  }
  // Sort: out-of-stock first, then low, then in-stock, then unmanaged.
  // Within each tier alpha by product+variant title.
  const order: Record<Row["state"], number> = {
    out_of_stock: 0,
    low_stock: 1,
    in_stock: 2,
    unmanaged: 3,
  };
  rows.sort((a, b) => {
    const t = order[a.state] - order[b.state];
    if (t !== 0) return t;
    return (a.productTitle + a.variantTitle).localeCompare(
      b.productTitle + b.variantTitle,
    );
  });
  return rows;
}

export default function B2bInventoryPage() {
  const [products, setProducts] = React.useState<Product[] | null>(null);
  const [orders, setOrders] = React.useState<Order[] | null>(null);
  const [availability, setAvailability] = React.useState<
    Map<string, AvailabilityRow>
  >(new Map());
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [onlyMine, setOnlyMine] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchProductsRaw().catch((err) => {
        throw err;
      }),
      medusa()
        .store.order.list({
          limit: 200,
          fields:
            "id,created_at,items.id,items.variant_id,items.variant_sku,items.quantity",
        } as Record<string, unknown>)
        .then((r) => (r as { orders?: Order[] }).orders ?? [])
        .catch(() => [] as Order[]),
      fetchAvailability().catch(() => new Map<string, AvailabilityRow>()),
    ])
      .then(([ps, os, av]) => {
        if (cancelled) return;
        setProducts(ps);
        setOrders(os);
        setAvailability(av);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = (err as Error).message ?? "";
        setError(msg || "Couldn't load inventory.");
        setProducts([]);
        setOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = React.useMemo(
    () => buildRows(products ?? [], orders ?? [], availability),
    [products, orders, availability],
  );

  const filtered = rows.filter((r) => {
    if (onlyMine && r.bought90 === 0) return false;
    if (!q) return true;
    const haystack = `${r.sku} ${r.productTitle} ${r.variantTitle}`.toLowerCase();
    return haystack.includes(q.toLowerCase());
  });

  const inStock = rows.filter((r) => r.state === "in_stock").length;
  const low = rows.filter((r) => r.state === "low_stock").length;
  const out = rows.filter((r) => r.state === "out_of_stock").length;
  const tracked = rows.length;

  const isLoading = products === null && !error;

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title="Inventory"
          subtitle="What's available today and how much you've been buying"
        />
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      )}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="SKUs tracked"
          value={isLoading ? "…" : tracked.toString()}
        />
        <StatCard
          label="In stock"
          value={isLoading ? "…" : inStock.toString()}
          tone="muted"
        />
        <StatCard
          label="Low stock"
          value={isLoading ? "…" : low.toString()}
          unit="≤ 10 units"
        />
        <StatCard
          label="Out of stock"
          value={isLoading ? "…" : out.toString()}
          tone="accent"
        />
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          leftAdornment={<Search className="h-4 w-4" />}
          placeholder="Filter by SKU or product…"
          className="max-w-md"
        />
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border-subtle bg-surface-raised px-3 py-1.5 text-caption text-text-secondary">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.currentTarget.checked)}
            className="h-3.5 w-3.5"
          />
          Only SKUs I&rsquo;ve bought
        </label>
        {out > 0 && (
          <Badge tone="danger" size="xs" dot>
            {out} out of stock
          </Badge>
        )}
      </div>

      {isLoading ? (
        <p className="mt-8 text-body-md text-text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title={
              rows.length === 0 ? "No catalog products yet" : "No matches"
            }
            description={
              rows.length === 0
                ? "Once products are seeded into the catalog they'll appear here."
                : onlyMine
                  ? "Clear the \"only my SKUs\" filter to see the full catalog."
                  : "Try a different search."
            }
          />
        </div>
      ) : (
        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <InventoryCard key={r.variantId} row={r} />
          ))}
        </section>
      )}
    </>
  );
}

function InventoryCard({ row }: { row: Row }) {
  const dailyAvg = row.bought90 / 90;
  const daysOfCover =
    row.stock != null && dailyAvg > 0 ? Math.floor(row.stock / dailyAvg) : null;
  return (
    <article className="rounded-lg border border-border-subtle bg-surface-raised p-5 numerics-tabular">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-caption text-text-muted">{row.sku}</p>
          <h3 className="mt-1 truncate text-body-md font-medium text-text-primary">
            {row.productTitle}
          </h3>
          <p className="text-caption text-text-muted">{row.variantTitle}</p>
        </div>
        <Badge tone={STATE_TONE[row.state]} size="xs">
          {STATE_LABEL[row.state]}
        </Badge>
      </header>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Stat
          label="Available"
          value={row.stock == null ? "—" : row.stock.toLocaleString()}
          sub="sellable now"
        />
        <Stat
          label="You bought"
          value={`${row.bought90.toLocaleString()} pcs`}
          sub="last 90d"
        />
        <Stat
          label="Cover"
          value={
            daysOfCover == null
              ? "—"
              : `${daysOfCover}d`
          }
          sub="at your rate"
        />
      </dl>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {row.unitPriceMajor != null && (
            <p className="text-caption text-text-muted">
              {formatINR(Math.round(row.unitPriceMajor))} / pc
            </p>
          )}
          <p className="text-caption text-text-muted">
            14-wk buy history
          </p>
        </div>
        <TrendChart
          data={row.weeklyTrend}
          width={140}
          height={32}
          showLastDot
          ariaLabel={`${row.productTitle} ${row.variantTitle} buy history`}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link href={`/wholesale/p/${row.productHandle}`}>View product</Link>
        </Button>
        {row.state !== "out_of_stock" && (
          <Button asChild size="sm">
            <Link href={`/wholesale/p/${row.productHandle}`}>Reorder</Link>
          </Button>
        )}
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <dt className="text-micro text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-body-md font-medium text-text-primary">
        {value}
      </dd>
      {sub && <p className="text-micro text-text-muted">{sub}</p>}
    </div>
  );
}
