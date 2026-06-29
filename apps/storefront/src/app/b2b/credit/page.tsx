"use client";

import * as React from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  CreditTermsPanel,
  EmptyState,
  StatCard,
  TrendChart,
  formatINR,
} from "@risitex/ui/components";
import { CreditCard } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";

/**
 * /b2b/credit — live read of /store/credit-terms/me.
 *
 * Behaviour matrix:
 *   - mode === "credit" : show CreditTermsPanel with real limit / used,
 *                         24-week utilisation trend, outstanding invoices
 *   - mode === "prepaid": show "you're on prepaid terms" notice with
 *                         the order-history list (no credit math)
 *   - 401              : sign-in CTA
 */

type CreditInvoice = {
  id: string;
  order_id: string;
  display_id: number | string;
  amount_major: number;
  created_at: string;
  due_at: string;
  days_to_due: number;
  status: "paid" | "due" | "due_soon" | "overdue";
  payment_status: string | null;
};

type CreditResponse = {
  mode: "credit" | "prepaid";
  company_trade_name: string | null;
  tier_name: string | null;
  terms: {
    id: string;
    code: string;
    name: string;
    days: number;
    advance_pct: number;
  } | null;
  limit_major: number | null;
  used_major: number;
  utilisation_trend: number[];
  invoices: CreditInvoice[];
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

async function fetchCredit(): Promise<CreditResponse> {
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = window.localStorage.getItem("medusa_auth_token");
  }
  const headers: Record<string, string> = {
    "x-publishable-api-key": PUB_KEY,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${MEDUSA_BASE_URL}/store/credit-terms/me`, {
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
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as CreditResponse;
}

function invoiceTone(
  s: CreditInvoice["status"],
): "success" | "warning" | "danger" | "info" {
  if (s === "paid") return "success";
  if (s === "overdue") return "danger";
  if (s === "due_soon") return "warning";
  return "info";
}
function invoiceLabel(s: CreditInvoice["status"]): string {
  if (s === "paid") return "paid";
  if (s === "overdue") return "overdue";
  if (s === "due_soon") return "due soon";
  return "due";
}
function dueLine(inv: CreditInvoice): string {
  if (inv.status === "paid") return "Paid";
  if (inv.days_to_due < 0) return `Overdue ${Math.abs(inv.days_to_due)}d`;
  if (inv.days_to_due === 0) return `Due today`;
  return `Due in ${inv.days_to_due}d · ${new Date(inv.due_at).toLocaleDateString()}`;
}

export default function B2bCreditPage() {
  const [data, setData] = React.useState<CreditResponse | null>(null);
  const [authErr, setAuthErr] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchCredit()
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = (err as Error).message ?? "";
        if (/401|Not authenticated/i.test(msg)) {
          setAuthErr(true);
        } else if (/account_not_verified|403/i.test(msg)) {
          setError(
            "Finish verifying your email and phone to see your credit panel.",
          );
        } else {
          setError(msg || "Couldn't load credit terms.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (authErr) {
    return (
      <>
        <header className="mb-6">
          <B2bTopbar
            title="Credit"
            subtitle="Limit, utilisation, invoices, payment terms"
          />
        </header>
        <EmptyState
          icon={<CreditCard className="h-5 w-5" />}
          title="Sign in to see your credit panel"
          description="Your credit limit, utilisation, and invoices are tied to your account."
          action={
            <Button asChild>
              <Link href="/auth/sign-in">Sign in</Link>
            </Button>
          }
        />
      </>
    );
  }

  if (error) {
    return (
      <>
        <header className="mb-6">
          <B2bTopbar
            title="Credit"
            subtitle="Limit, utilisation, invoices, payment terms"
          />
        </header>
        <p className="rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <header className="mb-6">
          <B2bTopbar
            title="Credit"
            subtitle="Limit, utilisation, invoices, payment terms"
          />
        </header>
        <p className="text-body-md text-text-muted">Loading…</p>
      </>
    );
  }

  // ── Prepaid path ────────────────────────────────────────────────
  if (data.mode === "prepaid") {
    return (
      <>
        <header className="mb-6">
          <B2bTopbar
            title="Credit"
            subtitle={
              data.tier_name
                ? `${data.tier_name} · prepaid terms`
                : "Prepaid terms"
            }
          />
        </header>

        <section className="rounded-lg border border-border-subtle bg-surface-raised p-6">
          <p className="text-micro text-text-muted">Payment policy</p>
          <h2 className="mt-1 font-display text-heading-md text-text-primary">
            You&rsquo;re on prepaid terms.
          </h2>
          <p className="mt-2 text-body-md text-text-muted">
            Orders are charged 100% in advance. There&rsquo;s no
            outstanding credit balance to track. To request net-30 / net-60
            terms, reach out to your account manager — credit terms unlock
            once your trading history meets the tier threshold.
          </p>
        </section>

        {data.invoices.length > 0 && (
          <section className="mt-8 rounded-lg border border-border-subtle bg-surface-raised">
            <header className="border-b border-border-subtle px-5 py-3">
              <p className="text-micro text-text-muted">Recent orders</p>
            </header>
            <ul className="divide-y divide-border-subtle numerics-tabular">
              {data.invoices.map((inv) => (
                <InvoiceRow key={inv.id} inv={inv} />
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }

  // ── Credit path ─────────────────────────────────────────────────
  const limitMajor = data.limit_major ?? 0;
  const usedMajor = data.used_major;
  const utilisationPct =
    limitMajor > 0
      ? Math.min(100, Math.round((usedMajor / limitMajor) * 100))
      : null;

  const due = data.invoices.filter((i) => i.status !== "paid");
  const overdue = due.filter((i) => i.status === "overdue").length;

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title="Credit"
          subtitle={`${data.terms!.name} · ${data.terms!.advance_pct}% advance · Net ${data.terms!.days}d`}
          rightActions={
            <Button asChild size="sm" variant="secondary">
              <a
                href={`mailto:hello@risitex.com?subject=${encodeURIComponent(
                  `Credit limit increase request${
                    data.company_trade_name
                      ? ` · ${data.company_trade_name}`
                      : ""
                  }`,
                )}&body=${encodeURIComponent(
                  `Current limit: ${
                    data.limit_major
                      ? `₹${data.limit_major.toLocaleString("en-IN")}`
                      : "no cap set"
                  }\nTerms: ${data.terms!.name} (Net ${data.terms!.days}d)\nRequested limit:\n\nReason / volume justification:\n`,
                )}`}
              >
                Request limit increase
              </a>
            </Button>
          }
        />
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <div className="md:col-span-7">
          <CreditTermsPanel
            terms={{
              limitMajor: limitMajor || 0,
              usedMajor,
              netDays: data.terms!.days,
              tierLabel: data.tier_name ?? data.terms!.name,
            }}
          />
        </div>
        <div className="md:col-span-5 space-y-4">
          <StatCard
            label="Utilisation"
            value={
              utilisationPct == null ? "—" : `${utilisationPct}%`
            }
            unit={
              limitMajor > 0
                ? `of ${formatINR(limitMajor)}`
                : "no cap set"
            }
            rightSlot={
              <TrendChart
                data={data.utilisation_trend}
                width={90}
                height={28}
                showLastDot
              />
            }
          />
          <StatCard
            label="Outstanding invoices"
            value={due.length.toString()}
            unit={
              overdue > 0
                ? `${overdue} overdue`
                : due.length > 0
                  ? `${formatINR(due.reduce((s, i) => s + i.amount_major, 0))} due`
                  : "everything settled"
            }
            tone={overdue > 0 ? "accent" : "muted"}
          />
        </div>
      </div>

      <section className="mt-8 rounded-lg border border-border-subtle bg-surface-raised">
        <header className="border-b border-border-subtle px-5 py-3">
          <p className="text-micro text-text-muted">Outstanding invoices</p>
        </header>
        {data.invoices.length === 0 ? (
          <p className="px-5 py-6 text-body-sm text-text-muted">
            No invoices in the last 24 weeks.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle numerics-tabular">
            {data.invoices.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function InvoiceRow({ inv }: { inv: CreditInvoice }) {
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      <div>
        <Link
          href={`/b2b/orders?order=${encodeURIComponent(inv.order_id)}`}
          className="font-mono text-body-sm text-text-primary underline-offset-4 hover:underline"
        >
          RST-{String(inv.display_id).padStart(6, "0")}
        </Link>
        <p className="text-caption text-text-muted">{dueLine(inv)}</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={invoiceTone(inv.status)} size="xs">
          {invoiceLabel(inv.status)}
        </Badge>
        <span className="font-mono text-body-sm text-text-primary">
          {formatINR(Math.round(inv.amount_major))}
        </span>
      </div>
    </li>
  );
}
