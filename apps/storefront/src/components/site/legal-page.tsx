import type { ReactNode } from "react";
import { Container } from "./container";
import { Breadcrumb } from "./breadcrumb";

/**
 * Shared shell for legal / policy / info pages (Privacy, Terms,
 * Refund, Shipping, FAQ). Server component — no client JS, fully
 * static and indexable. Renders a breadcrumb, editorial header with an
 * effective date, a constrained reading column, and a JSON-LD WebPage
 * node for SEO. Pages compose <PolicySection> children for each clause.
 */
export function LegalPage({
  title,
  eyebrow = "Policy",
  effective,
  intro,
  breadcrumbLabel,
  children,
}: {
  title: string;
  eyebrow?: string;
  effective?: string;
  intro?: ReactNode;
  breadcrumbLabel?: string;
  children: ReactNode;
}) {
  return (
    <Container>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: `${title} · RISITEX`,
            ...(effective ? { datePublished: effective } : {}),
            publisher: {
              "@type": "Organization",
              name: "RISITEX",
            },
          }),
        }}
      />
      <div className="pt-6">
        <Breadcrumb
          items={[
            { href: "/", label: "Home" },
            { href: "#", label: breadcrumbLabel ?? title },
          ]}
        />
      </div>

      <header className="border-b border-border-subtle py-10">
        <p className="text-micro text-text-muted">{eyebrow}</p>
        <h1 className="mt-2 text-display-lg text-text-primary">{title}</h1>
        {effective && (
          <p className="mt-3 text-body-sm text-text-muted">
            Effective {effective}
          </p>
        )}
        {intro && (
          <div className="mt-5 max-w-2xl text-body-md text-text-secondary">
            {intro}
          </div>
        )}
      </header>

      <article className="max-w-2xl py-10">{children}</article>
    </Container>
  );
}

export function PolicySection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-heading-md text-text-primary">{heading}</h2>
      <div className="mt-3 space-y-3 text-body-md text-text-secondary">
        {children}
      </div>
    </section>
  );
}

/** Bulleted list helper with consistent spacing/markers. */
export function PolicyList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-text-muted">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
