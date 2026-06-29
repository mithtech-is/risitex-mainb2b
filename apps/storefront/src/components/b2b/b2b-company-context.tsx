"use client";

import * as React from "react";
import Link from "next/link";
import { Button, EmptyState } from "@risitex/ui/components";
import { MEDUSA_BASE_URL } from "@/lib/medusa";
import { B2bTopbar } from "./b2b-topbar";
import { SignOutButton } from "@/components/auth/sign-out-button";

type Address = {
  line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
};

type CompanyContext = {
  authenticated?: boolean;
  customer?: {
    id?: string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  b2b?: {
    company?: {
      id?: string;
      gstin?: string | null;
      trade_name?: string | null;
      status?: string | null;
      billing_address?: Address | null;
      customer_tier_id?: string | null;
      sales_rep_id?: string | null;
    };
    customer_tier?: { code?: string; name?: string } | null;
    payment_terms?: string | null;
  } | null;
  application?: {
    status?: string;
    trade_name?: string | null;
    gstin?: string | null;
    applicant_email?: string | null;
    applicant_phone?: string | null;
    contact_name?: string | null;
    billing_address?: Address | null;
  } | null;
};

function metaStr(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const v = meta?.[key];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : undefined;
}

export function B2bCompanyContextPage({
  mode,
}: {
  mode: "profile" | "company" | "addresses" | "users" | "settings";
}) {
  const [state, setState] = React.useState<{
    loading: boolean;
    error: string | null;
    data: CompanyContext | null;
  }>({ loading: true, error: null, data: null });

  React.useEffect(() => {
    let cancelled = false;
    const token = window.localStorage.getItem("medusa_auth_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-publishable-api-key":
        process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(`${MEDUSA_BASE_URL}/store/companies/me`, {
      headers,
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Company context failed (${res.status})`);
        return (await res.json()) as CompanyContext;
      })
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: err instanceof Error ? err.message : "Could not load account",
            data: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const title = TITLES[mode];
  const subtitle = SUBTITLES[mode];

  if (state.loading) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title={title} subtitle={subtitle} />
        <div className="rounded-md border border-border-subtle bg-surface-raised p-6">
          <p className="text-body-sm text-text-muted">Loading account data...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex min-h-full flex-col gap-6">
        <B2bTopbar title={title} subtitle={subtitle} />
        <EmptyState
          title="Could not load account data"
          description={state.error}
          action={
            <Button asChild>
              <Link href="/auth/sign-in">Sign in again</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const customer = state.data?.customer;
  const b2b = state.data?.b2b;
  const company = b2b?.company;
  const application = state.data?.application;
  const meta = customer?.metadata ?? null;

  // Merge sources (most authoritative first):
  // 1. approved company row  →  2. submitted application  →  3. signup metadata.
  // Lets a freshly-registered customer see real values immediately instead
  // of "Not Available" placeholders. As ops finalises approval the underlying
  // source flips up the stack without any UI change.
  const tradeName =
    company?.trade_name ??
    application?.trade_name ??
    metaStr(meta, "company_name") ??
    null;
  const gstin =
    company?.gstin ?? application?.gstin ?? metaStr(meta, "gstin") ?? null;
  const pan = metaStr(meta, "pan") ?? null;
  const businessType = metaStr(meta, "business_type") ?? null;
  const tradeLicense = metaStr(meta, "trade_license") ?? null;
  const ownerName = metaStr(meta, "owner_name") ?? application?.contact_name ?? null;
  const status =
    company?.status ??
    (application?.status === "pending"
      ? "Pending approval"
      : application?.status === "approved"
        ? "Approved"
        : application?.status === "rejected"
          ? "Rejected"
          : "Awaiting submission");
  const tier =
    b2b?.customer_tier?.name ??
    b2b?.customer_tier?.code ??
    metaStr(meta, "tier") ??
    "Bronze (default)";
  const paymentTerms = b2b?.payment_terms ?? "Advance payment";
  const salesRep = company?.sales_rep_id ?? "To be assigned post-approval";
  const phone = customer?.phone ?? metaStr(meta, "phone") ?? application?.applicant_phone ?? null;

  const address =
    company?.billing_address ??
    application?.billing_address ??
    ({
      line1: metaStr(meta, "address"),
      city: metaStr(meta, "city"),
      state: metaStr(meta, "state"),
      postal_code: metaStr(meta, "pincode"),
      country_code: "in",
    } as Address);

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar title={title} subtitle={subtitle} />
      {mode === "profile" && (
        <InfoGrid
          items={[
            ["Name", [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || ownerName || "Not provided"],
            ["Email", customer?.email ?? "Not provided"],
            ["Phone", phone ?? "Not provided"],
            ["Customer ID", customer?.id ?? "Not available"],
            ["Company", tradeName ?? "Not provided"],
            ["Account Status", status],
          ]}
        />
      )}
      {mode === "company" && (
        <InfoGrid
          items={[
            ["Trade Name", tradeName ?? "Not provided"],
            ["GSTIN", gstin ?? "Not provided"],
            ["PAN", pan ?? "Not provided"],
            ["Business Type", businessType ?? "Not provided"],
            ["Trade License", tradeLicense ?? "Not provided"],
            ["Status", status],
            ["Tier", tier],
            ["Payment Terms", paymentTerms],
            ["Sales Rep", salesRep],
          ]}
        />
      )}
      {mode === "addresses" && (
        <InfoGrid
          items={[
            ["Address Line", address?.line1 ?? "Not provided"],
            ["City", address?.city ?? "Not provided"],
            ["State", address?.state ?? "Not provided"],
            ["PIN Code", address?.postal_code ?? "Not provided"],
            ["Country", address?.country_code?.toUpperCase() ?? "IN"],
          ]}
        />
      )}
      {mode === "users" && (
        <InfoGrid
          items={[
            ["Primary User", customer?.email ?? "Not available"],
            ["Role", "Company buyer"],
            ["Company", company?.trade_name ?? "Not available"],
            ["Status", company?.status ?? "Not available"],
          ]}
        />
      )}
      {mode === "settings" && (
        <InfoGrid
          items={[
            ["Theme", "Stored per browser"],
            ["Notifications", "Account and order notifications enabled"],
            ["Purchase Orders", "Enabled for approved companies"],
            ["Wallet", "Enabled"],
            ["Credit Terms", b2b?.payment_terms ?? "Advance payment"],
          ]}
        />
      )}

      {(mode === "profile" || mode === "settings") && (
        <section className="mt-2 rounded-md border border-border-subtle bg-surface-raised p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-heading-sm text-text-primary">Session</h2>
              <p className="mt-1 text-body-sm text-text-muted">
                Signed in as{" "}
                <span className="text-text-primary">
                  {customer?.email ?? "—"}
                </span>
                . Sign out clears this device only.
              </p>
            </div>
            <SignOutButton variant="danger-soft" />
          </div>
        </section>
      )}
    </div>
  );
}

function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-md border border-border-subtle bg-surface-raised p-5"
        >
          <p className="text-micro text-text-muted">{label}</p>
          <p className="mt-2 break-words text-body-md text-text-primary">
            {value}
          </p>
        </div>
      ))}
    </section>
  );
}

const TITLES = {
  profile: "Profile",
  company: "Company Details",
  addresses: "Addresses",
  users: "Company Users",
  settings: "Settings",
};

const SUBTITLES = {
  profile: "Your wholesale buyer profile",
  company: "GSTIN, tier, and payment terms",
  addresses: "Billing and dispatch context",
  users: "Company access and primary buyer",
  settings: "Wholesale account preferences",
};
