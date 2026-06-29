import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@risitex/ui/components";
import { Container } from "@/components/site/container";

export const metadata: Metadata = {
  title: "About RISITEX",
  description: "About RISITEX — India's premier B2B textile platform for wholesalers, dealers, and distributors.",
};

const FACTS = [
  { label: "Founded", value: "1962" },
  { label: "Manufacturing", value: "Tamil Nadu" },
  { label: "Products", value: "500+" },
  { label: "Dealers Nationwide", value: "50+" },
  { label: "Export Markets", value: "12 countries" },
  { label: "Years of Excellence", value: "60+" },
];

const MILESTONES = [
  { year: "1962", event: "Founded as a family textile mill in Erode, Tamil Nadu" },
  { year: "1985", event: "Expanded into garment manufacturing with modern sewing lines" },
  { year: "2000", event: "Built in-house quality testing laboratory" },
  { year: "2015", event: "Launched RISITEX brand for wholesale distribution" },
  { year: "2020", event: "Digitised operations with ERPNext integration" },
  { year: "2025", event: "Launched B2B wholesale platform with tier pricing and online ordering" },
];

export default function AboutPage() {
  return (
    <>
      <section className="border-b border-border-subtle">
        <Container>
          <div className="py-20 md:py-28">
            <p className="text-micro text-text-muted">About</p>
            <h1 className="mt-3 text-display-xl text-text-primary">
              India&rsquo;s Trusted Textile Partner for Businesses
            </h1>
            <p className="mt-6 max-w-prose text-body-lg text-text-secondary">
              For over six decades, RISITEX has been manufacturing premium textiles and garments
              for businesses across India and worldwide. Today, we serve dealers, distributors,
              retailers, and corporate clients through our digital B2B platform.
            </p>
          </div>
        </Container>
      </section>

      <section className="border-b border-border-subtle py-20">
        <Container>
          <dl className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6">
            {FACTS.map((f) => (
              <div key={f.label} className="text-center">
                <dt className="text-micro text-text-muted">{f.label}</dt>
                <dd className="mt-1 text-heading-lg text-text-primary numerics-tabular">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section className="border-b border-border-subtle bg-surface-sunken py-20">
        <Container>
          <p className="text-micro text-text-muted">Our Story</p>
          <h2 className="mt-2 text-heading-xl text-text-primary">Six Decades of Textile Excellence</h2>
          <div className="mt-10 space-y-8">
            {MILESTONES.map((m) => (
              <div key={m.year} className="flex items-start gap-6">
                <span className="text-mono-md text-brand-accent shrink-0 w-16">{m.year}</span>
                <div className="h-px w-8 bg-border-subtle mt-2.5 shrink-0" />
                <p className="text-body-lg text-text-secondary">{m.event}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-border-subtle py-20">
        <Container>
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-heading-xl text-text-primary">Our Mission</h2>
              <p className="mt-4 text-body-lg text-text-secondary">
                To make premium textile sourcing simple, transparent, and accessible for every
                business. We combine decades of manufacturing expertise with modern technology
                to deliver consistent quality, competitive pricing, and reliable service.
              </p>
            </div>
            <div>
              <h2 className="text-heading-xl text-text-primary">Our Values</h2>
              <ul className="mt-4 space-y-4">
                {[
                  { title: "Quality First", desc: "Every product batch is tested before dispatch. Consistent quality across every order." },
                  { title: "Transparent Pricing", desc: "No hidden charges. Clear tier-based pricing with volume discounts." },
                  { title: "Reliable Delivery", desc: "On-time dispatch with real-time tracking. PAN-India delivery network." },
                  { title: "Long-term Partnerships", desc: "We grow with our clients. Dealer and distributor relationships built on trust." },
                ].map((v) => (
                  <li key={v.title}>
                    <h3 className="text-heading-sm text-text-primary">{v.title}</h3>
                    <p className="text-body-md text-text-secondary">{v.desc}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container width="narrow" className="text-center">
          <h2 className="text-heading-xl text-text-primary">Partner with RISITEX</h2>
          <p className="mt-3 text-body-lg text-text-secondary">Join 50+ dealers and distributors nationwide.</p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/auth/sign-up">Apply for Wholesale Account</Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
