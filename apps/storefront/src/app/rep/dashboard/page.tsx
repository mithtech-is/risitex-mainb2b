"use client";

import * as React from "react";
import {
  Badge,
  EmptyState,
  StatCard,
  formatINR,
} from "@risitex/ui/components";
import { UserRound } from "lucide-react";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";

/**
 * /rep/dashboard — wired to /store/rep/me (FR-7.04). Resolves the logged-in
 * customer to a SalesRep (by email) and shows real assigned companies and
 * commission totals. Quota/pipeline analytics were removed — they had no
 * backing data; showing real commission + assignments instead.
 */

type RepResponse = {
  is_rep: boolean;
  rep?: { name: string; email: string };
  companies?: Array<{ id: string; name: string }>;
  commission?: { pending_minor: number; paid_minor: number };
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";
const major = (minor?: number) => formatINR(Math.round((minor ?? 0) / 100));

async function fetchRep(): Promise<RepResponse> {
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = window.localStorage.getItem("medusa_auth_token");
  }
  const headers: Record<string, string> = { "x-publishable-api-key": PUB_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${MEDUSA_BASE_URL}/store/rep/me`, {
    headers,
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as RepResponse;
}

export default function RepDashboardPage() {
  const [data, setData] = React.useState<RepResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchRep()
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = !data && !error;
  const companies = data?.companies ?? [];

  return (
    <>
      <header className="mb-6">
        <B2bTopbar
          title={data?.rep?.name ? `${data.rep.name} · Sales rep` : "Sales rep"}
          subtitle={
            data?.is_rep
              ? `${companies.length} companies under management`
              : "Your rep performance"
          }
        />
      </header>

      {error && (
        <p className="mb-6 rounded-md bg-feedback-warning-bg px-3 py-2 text-body-sm text-feedback-warning-text ring-1 ring-feedback-warning-border">
          {error}
        </p>
      )}

      {!isLoading && data && !data.is_rep ? (
        <EmptyState
          icon={<UserRound className="h-5 w-5" />}
          title="No rep profile on this account"
          description="This dashboard is for internal sales reps. If you should have access, ask an admin to link your email to a sales-rep record."
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard
              label="Commission earned"
              value={isLoading ? "…" : major(data?.commission?.paid_minor)}
              tone="accent"
              unit="paid"
            />
            <StatCard
              label="Commission pending"
              value={isLoading ? "…" : major(data?.commission?.pending_minor)}
            />
            <StatCard
              label="Companies"
              value={isLoading ? "…" : companies.length.toString()}
              unit="under management"
            />
          </section>

          <section className="mt-8">
            <article className="rounded-lg border border-border-subtle bg-surface-raised">
              <header className="border-b border-border-subtle px-5 py-3">
                <p className="text-micro text-text-muted">Companies</p>
                <h3 className="mt-1 font-display text-heading-md text-text-primary">
                  Under your management
                </h3>
              </header>
              {companies.length === 0 ? (
                <p className="px-5 py-6 text-body-sm text-text-muted">
                  {isLoading ? "Loading…" : "No companies assigned yet."}
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {companies.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunken text-text-secondary">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <p className="flex-1 min-w-0 text-body-sm font-medium text-text-primary">
                        {c.name}
                      </p>
                      <Badge tone="success" size="xs">
                        assigned
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </>
      )}
    </>
  );
}
