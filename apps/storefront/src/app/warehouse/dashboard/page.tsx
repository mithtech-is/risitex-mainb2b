"use client";

import * as React from "react";
import {
  Badge,
  Button,
  DistributionBar,
  NotificationFeed,
  StatCard,
  TrendChart,
} from "@risitex/ui/components";
import { Truck, PackageSearch } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";

const DISPATCH_TREND = [22, 28, 18, 34, 31, 42, 38, 45, 51, 47, 62, 58, 65, 72, 68, 78, 84, 92, 88, 95, 102, 108, 115, 122];

const QUEUE = [
  { id: "q1", orderRef: "RST-WS-000228", retailer: "Tank Road · Chennai", qty: 240, sla: "06h 12m", status: "picking" as const },
  { id: "q2", orderRef: "RST-WS-000226", retailer: "Sayaji · Mysuru", qty: 60, sla: "04h 02m", status: "packed" as const },
  { id: "q3", orderRef: "RST-WS-000225", retailer: "RS Puram · Coimbatore", qty: 120, sla: "02h 41m", status: "label-ready" as const },
  { id: "q4", orderRef: "RST-WS-000223", retailer: "100ft · Bengaluru", qty: 80, sla: "01h 18m", status: "label-ready" as const },
];

const STATUS_BADGE: Record<"picking" | "packed" | "label-ready", { tone: "info" | "warning" | "success"; label: string }> = {
  picking: { tone: "warning", label: "Picking" },
  packed: { tone: "info", label: "Packed" },
  "label-ready": { tone: "success", label: "Label ready" },
};

export default function WarehouseDashboardPage() {
  return (
    <>
      <header className="mb-6 flex items-end justify-between">
        <B2bTopbar
          title="Erode mill · Outbound"
          subtitle="Tirupur backup · 412 looms · daily capacity 2,800 pcs"
        />
        <Button size="sm">Generate manifest</Button>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Orders to fulfil" value={QUEUE.length.toString()} unit="today" />
        <StatCard
          label="Pieces dispatched"
          value={DISPATCH_TREND.reduce((s, n) => s + n, 0).toLocaleString()}
          unit="last 24h"
          rightSlot={<TrendChart data={DISPATCH_TREND} width={80} height={24} />}
        />
        <StatCard label="Capacity utilised" value="68%" unit="of 2,800 pcs/day" tone="muted" />
        <StatCard label="SLA breach risk" value="0" tone="muted" />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-6">
          <article className="rounded-lg border border-border-subtle bg-surface-raised">
            <header className="border-b border-border-subtle px-5 py-3">
              <p className="text-micro text-text-muted">Pick &amp; pack queue</p>
              <h3 className="mt-1 font-display text-heading-md text-text-primary">SLA leaderboard.</h3>
            </header>
            <ul className="divide-y divide-border-subtle">
              {QUEUE.map((q) => {
                const cfg = STATUS_BADGE[q.status];
                return (
                  <li key={q.id} className="flex items-center gap-3 px-5 py-3 numerics-tabular">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunken text-text-secondary">
                      <PackageSearch className="h-4 w-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-body-sm text-text-primary">{q.orderRef}</p>
                      <p className="text-caption text-text-muted">{q.retailer} · {q.qty} pcs</p>
                    </div>
                    <Badge tone={cfg.tone} size="xs">
                      {cfg.label}
                    </Badge>
                    <p className="ml-3 w-20 text-right font-mono text-caption text-text-muted">
                      SLA in {q.sla}
                    </p>
                    <Button size="xs" variant="tertiary">
                      Action
                    </Button>
                  </li>
                );
              })}
            </ul>
          </article>

          <article className="rounded-lg border border-border-subtle bg-surface-raised p-5">
            <p className="text-micro text-text-muted">Inventory by category</p>
            <div className="mt-5">
              <DistributionBar
                items={[
                  { label: "Shirting", value: 18_400 },
                  { label: "Trousering", value: 9_200 },
                  { label: "Fabric (m)", value: 32_500 },
                  { label: "Outerwear", value: 1_840 },
                  { label: "Accessories", value: 6_400 },
                ]}
                formatValue={(n) => `${n.toLocaleString()} pcs`}
              />
            </div>
          </article>
        </div>

        <aside className="lg:col-span-4 space-y-6">
          <article className="rounded-lg border border-border-subtle bg-surface-raised p-5">
            <p className="text-micro text-text-muted">Today&rsquo;s outbound</p>
            <div className="mt-4 space-y-3">
              {[
                { carrier: "Delhivery", pieces: 480, route: "Mumbai / Pune" },
                { carrier: "Shiprocket", pieces: 220, route: "Bengaluru / Chennai" },
                { carrier: "Porter", pieces: 120, route: "Hyderabad" },
              ].map((row) => (
                <div key={row.carrier} className="flex items-center justify-between rounded-md border border-border-subtle p-3">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-text-muted" />
                    <div>
                      <p className="text-body-sm font-medium text-text-primary">{row.carrier}</p>
                      <p className="text-caption text-text-muted">{row.route}</p>
                    </div>
                  </div>
                  <span className="text-mono-sm text-text-primary numerics-tabular">
                    {row.pieces} pcs
                  </span>
                </div>
              ))}
            </div>
          </article>

          <NotificationFeed
            title="Alerts"
            items={[
              { id: "n1", tone: "warning", title: "Poplin XL Natural reorder triggered", description: "On-hand 4 / reorder at 30", at: "2026-06-10T09:42:00" },
              { id: "n2", tone: "danger", title: "Damaged carton flagged for QA", description: "Carton DLV-2261004-12 · 4 pcs", at: "2026-06-10T07:18:00" },
              { id: "n3", tone: "success", title: "RST-WS-000220 delivered", description: "Mumbai 400013", at: "2026-06-09T15:21:00" },
            ]}
          />
        </aside>
      </section>
    </>
  );
}
