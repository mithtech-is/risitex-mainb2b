"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@risitex/ui/components";
import { B2bTopbar } from "@/components/b2b/b2b-topbar";
import { MEDUSA_BASE_URL } from "@/lib/medusa";

type CompanyContext = {
  customer?: {
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
  b2b?: {
    company?: {
      trade_name?: string | null;
      gstin?: string | null;
    };
    customer_tier?: { name?: string | null; code?: string | null } | null;
  } | null;
};

export default function SupportPage() {
  const [ctx, setCtx] = React.useState<CompanyContext | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const token = window.localStorage.getItem("medusa_auth_token");
    const headers: Record<string, string> = {
      "x-publishable-api-key":
        process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch(`${MEDUSA_BASE_URL}/store/companies/me`, {
      headers,
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setCtx(data as CompanyContext | null);
      })
      .catch(() => {
        if (!cancelled) setCtx(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const company = ctx?.b2b?.company?.trade_name ?? "RISITEX wholesale account";
  const tier = ctx?.b2b?.customer_tier?.name ?? ctx?.b2b?.customer_tier?.code;
  const email = ctx?.customer?.email ?? "";
  const subject = encodeURIComponent(`Wholesale support - ${company}`);
  const body = encodeURIComponent(
    [
      `Company: ${company}`,
      tier ? `Tier: ${tier}` : null,
      ctx?.b2b?.company?.gstin ? `GSTIN: ${ctx.b2b.company.gstin}` : null,
      email ? `Account email: ${email}` : null,
      "",
      "Issue type:",
      "Order / shipment / wallet / credit / catalogue / other",
      "",
      "Details:",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return (
    <div className="flex min-h-full flex-col gap-6">
      <B2bTopbar
        title="Support"
        subtitle="Wholesale account assistance and escalation paths"
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SupportCard
          title="Order Support"
          body="Track order status, download invoices, or raise a dispatch issue from your order history."
          action={<Link href="/b2b/orders">Open orders</Link>}
        />
        <SupportCard
          title="Shipment Support"
          body="Review AWB, carrier, delivery timelines, and shipment exceptions."
          action={<Link href="/b2b/shipments">Open shipments</Link>}
        />
        <SupportCard
          title="Finance Support"
          body="Check wallet balance, credit utilisation, invoices, and payment terms."
          action={<Link href="/b2b/invoices">Open invoices</Link>}
        />
      </section>

      <section className="rounded-md border border-border-subtle bg-surface-raised p-6">
        <p className="text-micro text-text-muted">Escalation</p>
        <h2 className="mt-2 text-heading-md text-text-primary">
          Contact wholesale support
        </h2>
        <p className="mt-2 max-w-2xl text-body-md text-text-secondary">
          Your company details are included in the draft so the support team can
          resolve account, order, wallet, or credit issues without asking you to
          repeat context.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <a href={`mailto:risitexindia@gmail.com?subject=${subject}&body=${body}`}>
              Email support
            </a>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/contact">Open contact form</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function SupportCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactElement;
}) {
  return (
    <article className="rounded-md border border-border-subtle bg-surface-raised p-5">
      <h2 className="text-heading-sm text-text-primary">{title}</h2>
      <p className="mt-2 text-body-sm text-text-secondary">{body}</p>
      <Button asChild size="sm" variant="secondary" className="mt-4">
        {action}
      </Button>
    </article>
  );
}
