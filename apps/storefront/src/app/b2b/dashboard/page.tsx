"use client";

import * as React from "react";
import Link from "next/link";
import {
  AiReorderSuggestion,
  Badge,
  Button,
  CreditTermsPanel,
  DistributionBar,
  NotificationFeed,
  StatCard,
  TrendChart,
  formatINR,
} from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { getCurrentCustomer } from "@/lib/auth";
import { medusa } from "@/lib/medusa";
import { useWallet, useWalletTransactions } from "@/features/wallet/hooks";

/**
 * /b2b/dashboard — wholesale operator landing.
 *
 * KPIs and lists are wired to live data:
 *   - Orders this quarter (count + delta vs prior quarter)   ← /store/orders
 *   - Spend this quarter (sum + delta)                       ← /store/orders
 *   - Wallet balance                                         ← /store/wallet
 *   - Recent orders                                          ← /store/orders
 *   - Top SKUs (last 90 days)                                ← /store/orders items
 *   - Activity feed                                          ← orders + wallet txns
 *   - Suggested reorder                                      ← derived from the
 *       customer's last-90d order history; each card carries the real
 *       medusaVariantId so Accept & add actually drops the line into the
 *       Zustand cart store.
 */

type Order = {
  id: string;
  display_id: number | string;
  status: string;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  created_at: string;
  total: number;
  items?: Array<{
    id: string;
    variant_id?: string | null;
    variant_sku?: string | null;
    product_handle?: string | null;
    title?: string | null;
    variant_title?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    subtotal?: number | null;
    total?: number | null;
    thumbnail?: string | null;
  }> | null;
};

function quarterStart(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1, 0, 0, 0, 0);
}
function previousQuarterStart(d: Date): Date {
  const q = quarterStart(d);
  const prev = new Date(q);
  prev.setMonth(prev.getMonth() - 3);
  return prev;
}
function pctChange(curr: number, prev: number): number | undefined {
  if (prev <= 0) return undefined;
  return ((curr - prev) / prev) * 100;
}
function weekBuckets(orders: Order[], weeks: number, now: Date) {
  const counts = new Array(weeks).fill(0) as number[];
  const spend = new Array(weeks).fill(0) as number[];
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const start = now.getTime() - weeks * weekMs;
  for (const o of orders) {
    const t = new Date(o.created_at).getTime();
    if (Number.isNaN(t) || t < start || t > now.getTime()) continue;
    const idx = Math.min(weeks - 1, Math.floor((t - start) / weekMs));
    counts[idx] = (counts[idx] ?? 0) + 1;
    spend[idx] = (spend[idx] ?? 0) + Number(o.total ?? 0);
  }
  return { counts, spend };
}
function aggregateSkus(orders: Order[], cutoff: Date): Array<{ label: string; value: number }> {
  const map = new Map<string, { label: string; value: number }>();
  for (const o of orders) {
    if (new Date(o.created_at) < cutoff) continue;
    for (const it of o.items ?? []) {
      const label = [it.title, it.variant_title].filter(Boolean).join(" · ") || "—";
      const subtotal = Number(it.subtotal ?? it.total ?? 0);
      const prev = map.get(label) ?? { label, value: 0 };
      prev.value += subtotal;
      map.set(label, prev);
    }
  }
  return Array.from(map.values())
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

type ReorderCandidate = {
  variantId: string;
  sku: string;
  productHandle: string;
  productName: string;
  variantTitle: string;
  unitPriceMajor: number;
  suggestedQty: number;
  confidence: number;
  rationale: string;
  swatchHex: string;
};

const COLOUR_TO_HEX: Record<string, string> = {
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
function swatchFromVariantTitle(s: string): string {
  const lower = s.toLowerCase();
  for (const [k, v] of Object.entries(COLOUR_TO_HEX)) {
    if (lower.includes(k)) return v;
  }
  return "#A0978A";
}

function buildReorderCandidates(
  orders: Order[],
  cutoff: Date,
): ReorderCandidate[] {
  // For each variant the customer bought in the last 90 days, track:
  //   - total qty
  //   - number of distinct orders that contained it
  //   - most-recent order date (for recency tie-break)
  //   - most-recent unit price (real, not avg)
  //   - canonical product name + variant title (last seen wins)
  type Agg = {
    variantId: string;
    sku: string;
    productHandle: string;
    productName: string;
    variantTitle: string;
    qty: number;
    orderCount: number;
    lastSeen: number;
    unitPrice: number;
  };
  const map = new Map<string, Agg>();
  for (const o of orders) {
    const t = new Date(o.created_at).getTime();
    if (Number.isNaN(t) || t < cutoff.getTime()) continue;
    const seenInOrder = new Set<string>();
    for (const it of o.items ?? []) {
      const vId = it.variant_id;
      if (!vId) continue;
      const qty = Number(it.quantity ?? 0);
      if (qty <= 0) continue;
      const subtotal = Number(it.subtotal ?? it.total ?? 0);
      const unitPrice = Number(
        it.unit_price ??
          (qty > 0 ? subtotal / qty : 0),
      );
      const existing = map.get(vId);
      if (!existing) {
        map.set(vId, {
          variantId: vId,
          sku: it.variant_sku ?? vId,
          productHandle: it.product_handle ?? "",
          productName: it.title ?? "—",
          variantTitle: it.variant_title ?? "",
          qty,
          orderCount: 1,
          lastSeen: t,
          unitPrice,
        });
        seenInOrder.add(vId);
        continue;
      }
      const newer = t > existing.lastSeen;
      map.set(vId, {
        variantId: vId,
        sku: existing.sku,
        productHandle: existing.productHandle || it.product_handle || "",
        productName: newer ? it.title ?? existing.productName : existing.productName,
        variantTitle: newer
          ? it.variant_title ?? existing.variantTitle
          : existing.variantTitle,
        qty: existing.qty + qty,
        orderCount: seenInOrder.has(vId)
          ? existing.orderCount
          : existing.orderCount + 1,
        lastSeen: Math.max(existing.lastSeen, t),
        unitPrice: newer ? unitPrice || existing.unitPrice : existing.unitPrice,
      });
      seenInOrder.add(vId);
    }
  }

  // Rank: most-recent first, then by order frequency. We want to
  // surface SKUs the customer just bought (= likely to need again
  // soon), tiebreak with how habitual the buy is.
  const arr = Array.from(map.values());
  arr.sort((a, b) => {
    if (b.lastSeen !== a.lastSeen) return b.lastSeen - a.lastSeen;
    return b.orderCount - a.orderCount;
  });

  return arr.slice(0, 4).map((a) => {
    // Suggested qty = average per-order qty (rounded up to nearest 10
    // so it feels like a real reorder, not a fractional refill).
    const avg = a.qty / Math.max(1, a.orderCount);
    const suggestedQty = Math.max(10, Math.round(avg / 10) * 10);
    // Confidence = how many orders contained this SKU vs the total
    // orders in the window, capped at 0.95.
    const ordersInWindow = orders.filter(
      (o) => new Date(o.created_at).getTime() >= cutoff.getTime(),
    ).length;
    const confidence = Math.min(
      0.95,
      Math.max(0.4, a.orderCount / Math.max(1, ordersInWindow)),
    );
    const daysSinceLast = Math.max(
      1,
      Math.floor((Date.now() - a.lastSeen) / 86_400_000),
    );
    const rationale =
      a.orderCount >= 2
        ? `Last order ${daysSinceLast}d ago. You buy ~${Math.round(avg)} pcs each time across ${a.orderCount} orders in 90 days.`
        : `Last order ${daysSinceLast}d ago. Same qty as last time keeps your buffer.`;
    return {
      variantId: a.variantId,
      sku: a.sku,
      productHandle: a.productHandle || a.variantId,
      productName: a.productName,
      variantTitle: a.variantTitle,
      unitPriceMajor: Math.max(0, Math.round(a.unitPrice)),
      suggestedQty,
      confidence,
      rationale,
      swatchHex: swatchFromVariantTitle(a.variantTitle),
    };
  });
}

export default function B2bDashboardPage() {
  const [firstName, setFirstName] = React.useState<string | null>(null);
  const [orders, setOrders] = React.useState<Order[] | null>(null);
  const [ordersError, setOrdersError] = React.useState<string | null>(null);
  const wallet = useWallet();
  const walletTxns = useWalletTransactions({ limit: 5 });
  const [dismissedReorder, setDismissedReorder] = React.useState<Set<string>>(
    () => new Set(),
  );

  React.useEffect(() => {
    void getCurrentCustomer().then((c) => {
      const fn = (c as { first_name?: string | null } | null)?.first_name;
      setFirstName(typeof fn === "string" && fn.trim() ? fn.trim() : null);
    });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    medusa()
      .store.order.list({
        limit: 250,
        fields:
          "id,display_id,status,payment_status,fulfillment_status,created_at,total," +
          "items.id,items.variant_id,items.variant_sku,items.product_handle," +
          "items.title,items.variant_title,items.quantity,items.unit_price," +
          "items.subtotal,items.total,items.thumbnail",
      } as Record<string, unknown>)
      .then((r) => {
        if (cancelled) return;
        setOrders(((r as { orders?: Order[] }).orders ?? []) as Order[]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = (err as Error).message ?? "";
        setOrdersError(
          /401|Not authenticated/i.test(msg)
            ? "Sign in to see your orders, spend, and reorder suggestions."
            : "Couldn't load orders.",
        );
        setOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived KPIs ────────────────────────────────────────────────
  const now = React.useMemo(() => new Date(), []);
  const qStart = React.useMemo(() => quarterStart(now), [now]);
  const prevQStart = React.useMemo(() => previousQuarterStart(now), [now]);
  const ninetyDaysAgo = React.useMemo(
    () => new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
    [now],
  );

  const ordersList = React.useMemo(() => orders ?? [], [orders]);
  const ordersThisQ = ordersList.filter((o) => new Date(o.created_at) >= qStart);
  const ordersPrevQ = ordersList.filter((o) => {
    const t = new Date(o.created_at);
    return t >= prevQStart && t < qStart;
  });
  const spendThisQ = ordersThisQ.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const spendPrevQ = ordersPrevQ.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const ordersDelta = pctChange(ordersThisQ.length, ordersPrevQ.length);
  const spendDelta = pctChange(spendThisQ, spendPrevQ);

  const { counts: orderTrend, spend: spendTrend } = React.useMemo(
    () => weekBuckets(ordersList, 24, now),
    [ordersList, now],
  );

  const topSkus = React.useMemo(
    () => aggregateSkus(ordersList, ninetyDaysAgo),
    [ordersList, ninetyDaysAgo],
  );

  const reorderCandidates = React.useMemo(
    () =>
      buildReorderCandidates(ordersList, ninetyDaysAgo)
        .filter((c) => !dismissedReorder.has(c.variantId))
        .slice(0, 2),
    [ordersList, ninetyDaysAgo, dismissedReorder],
  );

  const handleReorderDismiss = (c: ReorderCandidate) => {
    setDismissedReorder((s) => {
      const next = new Set(s);
      next.add(c.variantId);
      return next;
    });
  };

  const walletPaise = wallet.data ? Number(wallet.data.balance_inr) + Number(wallet.data.promo_balance_inr) : 0;

  // ── Activity feed: recent orders + recent wallet credits ────────
  const recentOrders = ordersList.slice(0, 4);
  const recentWalletTxns = (walletTxns.data?.transactions ?? []).slice(0, 2);
  const activityItems = [
    ...recentOrders.slice(0, 2).map((o) => ({
      id: `o-${o.id}`,
      tone:
        o.fulfillment_status === "delivered"
          ? ("success" as const)
          : o.fulfillment_status === "shipped"
            ? ("info" as const)
            : ("info" as const),
      title: `Order RST-${String(o.display_id).padStart(6, "0")} · ${o.status}`,
      description: new Date(o.created_at).toLocaleDateString(),
      at: o.created_at,
      href: `/b2b/orders/${o.id}`,
    })),
    ...recentWalletTxns.map((t) => ({
      id: `w-${t.id}`,
      tone:
        t.direction === "credit" ? ("info" as const) : ("warning" as const),
      title:
        t.direction === "credit"
          ? `Wallet credited ${formatINR(Math.round(Number(t.amount_inr) / 100))}`
          : `Wallet debited ${formatINR(Math.round(Number(t.amount_inr) / 100))}`,
      description: t.note ?? t.kind,
      at: t.created_at,
      href: "/b2b/wallet",
    })),
  ];

  const greetingTitle = firstName
    ? `Welcome back, ${firstName}.`
    : "Welcome back.";

  const isLoadingOrders = orders === null && !ordersError;

  return (
    <>
      <header className="mb-6 flex items-end justify-between">
        <B2bTopbar
          title={greetingTitle}
          subtitle="Wholesale workspace"
        />
        <Button asChild>
          <Link href="/wholesale/catalogue">Open catalogue</Link>
        </Button>
      </header>

      {ordersError && (
        <p className="mb-6 rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {ordersError}
        </p>
      )}

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Orders this quarter"
          value={isLoadingOrders ? "…" : String(ordersThisQ.length)}
          deltaPct={ordersDelta}
          deltaLabel="vs last quarter"
          rightSlot={<TrendChart data={orderTrend} width={80} height={24} />}
        />
        <StatCard
          label="Spend this quarter"
          value={
            isLoadingOrders ? "…" : formatINR(Math.round(spendThisQ))
          }
          deltaPct={spendDelta}
          deltaLabel="vs last quarter"
          rightSlot={<TrendChart data={spendTrend} width={80} height={24} />}
        />
        <StatCard
          label="Wallet balance"
          value={
            wallet.loading
              ? "…"
              : formatINR(Math.round(walletPaise / 100))
          }
          unit={wallet.data?.status === "frozen" ? "frozen" : "main + promo"}
          tone="accent"
        />
        <StatCard
          label="Lifetime orders"
          value={isLoadingOrders ? "…" : String(ordersList.length)}
          unit="all time"
        />
      </section>

      {/* Main grid */}
      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-6">
          {/* Top SKUs — real data when orders are present */}
          {topSkus.length > 0 && (
            <div className="rounded-lg border border-border-subtle bg-surface-raised p-5">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-micro text-text-muted">Top SKUs</p>
                  <h3 className="mt-1 font-display text-heading-md text-text-primary">
                    Where your money went.
                  </h3>
                </div>
                <span className="text-caption text-text-muted">Last 90 days</span>
              </div>
              <div className="mt-5">
                <DistributionBar
                  items={topSkus}
                  formatValue={(n) => formatINR(Math.round(n))}
                />
              </div>
            </div>
          )}

          {/* Recent orders — real */}
          <div className="rounded-lg border border-border-subtle bg-surface-raised">
            <header className="flex items-baseline justify-between border-b border-border-subtle px-5 py-3">
              <p className="text-micro text-text-muted">Recent orders</p>
              <Link
                href="/b2b/orders"
                className="text-caption text-text-secondary underline-offset-4 hover:underline"
              >
                View all →
              </Link>
            </header>
            {isLoadingOrders ? (
              <p className="px-5 py-6 text-body-sm text-text-muted">Loading…</p>
            ) : recentOrders.length === 0 ? (
              <p className="px-5 py-6 text-body-sm text-text-muted">
                No orders yet. Place your first wholesale order from the catalogue.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/b2b/orders/${o.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 transition-colors duration-fast hover:bg-surface-sunken"
                    >
                      <div>
                        <p className="text-mono-sm text-text-primary numerics-tabular">
                          RST-{String(o.display_id).padStart(6, "0")}
                        </p>
                        <p className="text-caption text-text-muted">
                          {new Date(o.created_at).toLocaleDateString()} ·{" "}
                          {(o.items?.length ?? 0)} line
                          {o.items?.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          tone={
                            o.fulfillment_status === "delivered"
                              ? "success"
                              : o.status === "cancelled"
                                ? "danger"
                                : "info"
                          }
                          size="xs"
                        >
                          {o.fulfillment_status ?? o.status}
                        </Badge>
                        <span className="font-mono text-body-sm text-text-primary numerics-tabular">
                          {formatINR(Math.round(Number(o.total ?? 0)))}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right rail */}
        <aside className="lg:col-span-5 space-y-6">
          <NotificationFeed
            title="Activity"
            items={
              activityItems.length > 0
                ? activityItems
                : [
                    {
                      id: "n-empty",
                      tone: "info",
                      title: "Nothing to report yet.",
                      description:
                        "Place your first order or top up your wallet to see activity here.",
                      at: now.toISOString(),
                      href: "/wholesale/catalogue",
                    },
                  ]
            }
          />

          <div className="rounded-lg border border-border-subtle bg-surface-raised p-5">
            <p className="text-micro text-text-muted">Wallet balance</p>
            <p className="mt-2 font-display text-heading-xl text-text-primary numerics-tabular">
              {wallet.loading
                ? "…"
                : formatINR(Math.round(walletPaise / 100))}
            </p>
            <p className="text-caption text-text-muted">
              {wallet.data?.status === "frozen"
                ? "Wallet is currently frozen"
                : "Apply to any wholesale order at checkout"}
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-4">
              <Link href="/b2b/wallet">Open wallet</Link>
            </Button>
          </div>
        </aside>
      </section>
    </>
  );
}
