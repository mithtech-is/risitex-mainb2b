"use client";

import * as React from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  StatCard,
} from "@risitex/ui/components";
import { CalendarClock, Search } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";

/**
 * /b2b/backorders — live read of the backorder module via
 * /store/backorders. Each row is one customer line-item that couldn't
 * ship from stock and is sitting in the production queue.
 *
 * Status mapping (model enum → display):
 *   pending    → "Queued"
 *   in_prod    → "In production"
 *   fulfilled  → "Fulfilled"
 *   cancelled  → "Cancelled"
 */

type Backorder = {
  id: string;
  order_id: string;
  order_display_id: number | string | null;
  line_id: string;
  sku: string;
  qty: number;
  eta: string | null;
  status: "pending" | "in_prod" | "fulfilled" | "cancelled";
  jira_ticket_id: string | null;
  cancelled_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<Backorder["status"], string> = {
  pending: "Queued",
  in_prod: "In production",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};
const STATUS_TONE: Record<
  Backorder["status"],
  "success" | "warning" | "info" | "danger"
> = {
  pending: "warning",
  in_prod: "info",
  fulfilled: "success",
  cancelled: "danger",
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

async function fetchBackorders(): Promise<Backorder[]> {
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = window.localStorage.getItem("medusa_auth_token");
  }
  const headers: Record<string, string> = {
    "x-publishable-api-key": PUB_KEY,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${MEDUSA_BASE_URL}/store/backorders`, {
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const b = (await res.json()) as { message?: string };
      detail = b?.message ?? "";
    } catch {
      // ignore
    }
    throw new Error(
      detail || `${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as { backorders: Backorder[] };
  return body.backorders ?? [];
}

export default function B2bBackordersPage() {
  const [backorders, setBackorders] = React.useState<Backorder[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [authErr, setAuthErr] = React.useState(false);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    fetchBackorders()
      .then((rows) => {
        if (cancelled) return;
        setBackorders(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = (err as Error).message ?? "";
        if (/401|Not authenticated/i.test(msg)) {
          setAuthErr(true);
        } else if (/account_not_verified|403/i.test(msg)) {
          setError(
            "Finish verifying your email and phone to see backorders.",
          );
        } else {
          setError(msg || "Couldn't load backorders.");
        }
        setBackorders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const all = backorders ?? [];
  const filtered = all.filter(
    (b) =>
      !q ||
      b.sku.toLowerCase().includes(q.toLowerCase()) ||
      String(b.order_display_id ?? "")
        .toLowerCase()
        .includes(q.toLowerCase()),
  );

  const queued = all.filter((b) => b.status === "pending").length;
  const inProd = all.filter((b) => b.status === "in_prod").length;
  const ready = all.filter((b) => b.status === "fulfilled").length;

  const isLoading = backorders === null && !error && !authErr;

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title="Backorders"
          subtitle="What you ordered before stock landed"
        />
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      )}

      {authErr ? (
        <div className="py-16">
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title="Sign in to see backorders"
            description="Backorders are tied to the orders on your account."
            action={
              <Button asChild>
                <Link href="/auth/sign-in">Sign in</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard
              label="Queued"
              value={isLoading ? "…" : queued.toString()}
              tone="muted"
            />
            <StatCard
              label="In production"
              value={isLoading ? "…" : inProd.toString()}
              tone="accent"
            />
            <StatCard
              label="Fulfilled"
              value={isLoading ? "…" : ready.toString()}
            />
          </section>

          <div className="mt-6 flex items-center gap-3">
            <Input
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              leftAdornment={<Search className="h-4 w-4" />}
              placeholder="Filter by SKU or order id…"
              className="max-w-md"
            />
          </div>

          {isLoading ? (
            <p className="mt-8 text-body-md text-text-muted">Loading…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title={all.length === 0 ? "No backorders" : "No matches"}
              description={
                all.length === 0
                  ? "Everything you've ordered shipped from in-stock inventory."
                  : "Try clearing the search."
              }
              className="mt-8"
            />
          ) : (
            <ul className="mt-6 space-y-3">
              {filtered.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-4 rounded-lg border border-border-subtle bg-surface-raised p-5"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-feedback-warning-bg text-feedback-warning-text">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0 numerics-tabular">
                    <p className="font-mono text-caption text-text-muted">
                      {b.sku}
                    </p>
                    <p className="text-body-md font-medium text-text-primary">
                      Order RST-
                      {String(b.order_display_id ?? "").padStart(6, "0")}
                      {" · "}
                      {b.qty} pcs
                    </p>
                    <p className="text-caption text-text-muted">
                      {b.eta
                        ? `Expected ${new Date(b.eta).toLocaleDateString()}`
                        : "ETA pending production confirmation"}
                      {b.jira_ticket_id ? ` · ${b.jira_ticket_id}` : ""}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[b.status]} size="xs">
                    {STATUS_LABELS[b.status]}
                  </Badge>
                  <Button asChild size="sm" variant="tertiary">
                    <Link href={`/b2b/orders?order=${encodeURIComponent(b.order_id)}`}>
                      Open order
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
