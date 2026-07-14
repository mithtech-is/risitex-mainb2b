import type { ReactNode } from "react";
import { Container } from "./container";
import { Breadcrumb } from "./breadcrumb";
import { Reveal } from "./reveal";
import { COMPANY } from "@/lib/company";

/**
 * Shared shell for legal / policy / info pages (Privacy, Terms, Refund,
 * Shipping). Server component — content is server-rendered and fully
 * indexable (the <Reveal> wrappers are client islands that only animate
 * opacity/transform, so the text stays in the HTML). Renders a breadcrumb,
 * a premium editorial header with an effective date, a constrained reading
 * column, and a JSON-LD WebPage node for SEO. Pages compose <PolicySection>
 * children for each clause.
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
              name: COMPANY.name,
              email: COMPANY.email,
              telephone: COMPANY.phone,
              taxID: COMPANY.gstin,
              address: {
                "@type": "PostalAddress",
                streetAddress: COMPANY.address,
                addressLocality: COMPANY.city,
                addressRegion: COMPANY.state,
                postalCode: COMPANY.postalCode,
                addressCountry: "IN",
              },
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

      <header className="relative overflow-hidden border-b border-border-subtle py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-[280px] w-[280px] rounded-full bg-indigo-400/10 blur-3xl"
        />
        <Reveal className="relative">
          <p className="text-micro font-semibold uppercase tracking-[0.2em] text-brand-accent">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-display-lg text-text-primary md:text-display-xl">
            {title}
          </h1>
          {effective && (
            <p className="mt-3 text-body-sm text-text-muted">
              Effective {effective}
            </p>
          )}
          {intro && (
            <div className="mt-5 max-w-2xl text-body-lg text-text-secondary">
              {intro}
            </div>
          )}
        </Reveal>
      </header>

      <article className="max-w-2xl py-12">{children}</article>
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
    <Reveal className="mt-10 first:mt-0">
      <section>
        <h2 className="flex items-center gap-3 text-heading-md text-text-primary">
          <span
            aria-hidden
            className="h-5 w-1 shrink-0 rounded-full bg-brand-accent"
          />
          {heading}
        </h2>
        <div className="mt-3 space-y-3 pl-4 text-body-md leading-relaxed text-text-secondary">
          {children}
        </div>
      </section>
    </Reveal>
  );
}

/** Bulleted list helper with consistent accent markers. */
export function PolicyList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span
            aria-hidden
            className="mt-2 h-[6px] w-[6px] shrink-0 rounded-full bg-brand-accent"
          />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
