"use client";

import Link from "next/link";
import {
  ApprovalStatusCard,
  Badge,
  Button,
  StatCard,
  formatINR,
} from "@risitex/ui/components";
import { Container } from "@/components/site/container";

export default function B2bApprovedPage() {
  return (
    <Container width="narrow">
      <div className="py-16">
        <p className="text-micro text-feedback-success-text">Approved</p>
        <h1 className="mt-2 font-display text-display-lg text-text-primary">
          Welcome to RISITEX wholesale.
        </h1>
        <p className="mt-3 text-body-md text-text-muted">
          Your account is live. The catalogue you already know now shows
          tier pricing, MOQ, master carton, and lead time against every SKU.
        </p>

        <div className="mt-10">
          <ApprovalStatusCard
            status="approved"
            details={
              <div className="flex items-center gap-2 text-body-sm text-text-secondary">
                <Badge tone="accent" size="xs">Gold tier</Badge>
                <span>Credit limit {formatINR(200000)} · Net 30</span>
              </div>
            }
            action={
              <Button asChild>
                <Link href="/b2b/dashboard">Open the portal</Link>
              </Button>
            }
          />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard label="Tier" value="Gold" tone="accent" />
          <StatCard label="MOQ" value="240 pcs" unit="from" />
          <StatCard label="Credit" value={formatINR(200000)} unit="Net 30" />
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { title: "Browse the catalogue", body: "Tier pricing, MOQ and carton info on every SKU.", href: "/wholesale/catalogue", cta: "Open" },
            { title: "Build your first order", body: "Use the matrix grid to plan sizes × colours.", href: "/wholesale/p/poplin-shirt-natural", cta: "Try it" },
            { title: "Set up your team", body: "Invite buyers, finance users, and approvers into your company workspace.", href: "/b2b/company-users", cta: "Manage users" },
          ].map((s) => (
            <li key={s.title} className="rounded-lg border border-border-subtle bg-surface-raised p-5">
              <p className="font-display text-heading-sm text-text-primary">{s.title}</p>
              <p className="mt-2 text-body-sm text-text-secondary">{s.body}</p>
              <Button asChild variant="tertiary" size="sm" className="mt-3">
                <Link href={s.href}>{s.cta} →</Link>
              </Button>
            </li>
          ))}
        </ol>
      </div>
    </Container>
  );
}
