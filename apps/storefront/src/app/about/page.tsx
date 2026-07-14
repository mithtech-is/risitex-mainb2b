import type { Metadata } from "next";
import Link from "next/link";
import {
  Factory,
  ShieldCheck,
  BadgePercent,
  Gauge,
  Truck,
  Headphones,
  ArrowRight,
} from "lucide-react";
import { Button } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { Reveal } from "@/components/site/reveal";

export const metadata: Metadata = {
  title: "About RISITEX — Premium Apparel Manufacturing for Businesses",
  description:
    "RISITEX is an Indian textile manufacturer building premium men's apparel for wholesale. Six decades of craftsmanship, large-scale production, and a wholesale-first partnership model.",
  alternates: { canonical: "/about" },
};

const WHY_CHOOSE = [
  { icon: Factory, title: "Reliable Manufacturing", desc: "Vertically-run production lines with the capacity and discipline to deliver every order on schedule.", chip: "bg-indigo-500" },
  { icon: ShieldCheck, title: "Consistent Quality", desc: "Every batch is inspected against a fixed standard — the tenth carton matches the first.", chip: "bg-sage-500" },
  { icon: BadgePercent, title: "Competitive Wholesale Pricing", desc: "Factory-direct, tier-based pricing with volume incentives and no hidden charges.", chip: "bg-ochre-500" },
  { icon: Gauge, title: "Large Production Capacity", desc: "Scale from a first trial order to full container loads without changing suppliers.", chip: "bg-madder-500" },
  { icon: Truck, title: "Fast Nationwide Delivery", desc: "A logistics network reaching every state and union territory, with live dispatch tracking.", chip: "bg-slate-cool-500" },
  { icon: Headphones, title: "Dedicated Business Support", desc: "A named account manager for quotations, sourcing, and ongoing wholesale requirements.", chip: "bg-indigo-500" },
];

/** Small reusable label above each section heading. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-micro font-semibold uppercase tracking-[0.2em] text-brand-accent">
      {children}
    </p>
  );
}

/** A heading word with the signature gold underline. */
function Underline({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative whitespace-nowrap">
      {children}
      <span
        aria-hidden
        className="absolute -bottom-1 left-0 h-1 w-full rounded-full bg-ochre-400"
      />
    </span>
  );
}

export default function AboutPage() {
  return (
    <>
      <style>{`
        @keyframes risitexFloatA { 0%,100%{transform:translate3d(0,0,0)} 50%{transform:translate3d(0,-26px,0)} }
        @keyframes risitexFloatB { 0%,100%{transform:translate3d(0,0,0)} 50%{transform:translate3d(0,24px,0)} }
        @media (prefers-reduced-motion: reduce){ .risitex-float{animation:none !important} }
      `}</style>

      {/* 1 ── HERO ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border-subtle">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="risitex-float absolute -left-16 -top-10 h-[300px] w-[300px] rounded-full bg-indigo-400/25 blur-3xl"
            style={{ animation: "risitexFloatA 15s ease-in-out infinite" }}
          />
          <div
            className="risitex-float absolute -right-10 top-24 h-[340px] w-[340px] rounded-full bg-ochre-400/20 blur-3xl"
            style={{ animation: "risitexFloatB 18s ease-in-out infinite" }}
          />
          <div
            className="risitex-float absolute bottom-0 left-1/3 h-[260px] w-[260px] rounded-full bg-sage-400/15 blur-3xl"
            style={{ animation: "risitexFloatA 21s ease-in-out infinite" }}
          />
        </div>
        <Container>
          <div className="relative py-24 md:py-32">
            <Reveal>
              <Eyebrow>RISITEX · Manufacturing since 1962</Eyebrow>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-4 max-w-4xl font-display text-display-xl text-text-primary md:text-display-2xl">
                Crafting Quality.{" "}
                <span className="text-brand-accent">Building Business.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 max-w-2xl text-body-lg text-text-secondary">
                Premium men&rsquo;s apparel manufacturing for modern businesses —
                six decades of textile craftsmanship, engineered for wholesale
                and built for partners who plan to grow.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/wholesale/catalogue">
                    Browse Catalogue <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/contact">Contact Us</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* 2 ── WHY BUSINESSES CHOOSE RISITEX ────────────────────── */}
      <section className="border-b border-border-subtle py-20 md:py-24">
        <Container>
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow>Why RISITEX</Eyebrow>
              <h2 className="mt-3 font-display text-heading-xl text-text-primary">
                Why businesses{" "}
                <Underline>choose us</Underline>
              </h2>
              <p className="mt-4 text-body-md text-text-secondary">
                An international textile manufacturer, wholesale-first by design —
                everything a serious B2B buyer needs to source with confidence.
              </p>
            </div>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_CHOOSE.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 80}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised p-6 transition-all duration-base ease-standard hover:-translate-y-1 hover:border-border-strong hover:shadow-popover">
                  <span
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-rest transition-transform duration-base ease-standard group-hover:-rotate-6 group-hover:scale-110 ${f.chip}`}
                  >
                    <f.icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h3 className="mt-5 font-display text-heading-md text-text-primary">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-body-md leading-relaxed text-text-secondary">
                    {f.desc}
                  </p>
                  <span
                    aria-hidden
                    className={`absolute inset-x-0 bottom-0 h-1 ${f.chip}`}
                  />
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* 3 ── CTA ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="risitex-float absolute -left-10 top-6 h-[300px] w-[300px] rounded-full bg-indigo-400/20 blur-3xl"
            style={{ animation: "risitexFloatB 17s ease-in-out infinite" }}
          />
          <div
            className="risitex-float absolute -right-12 -bottom-10 h-[300px] w-[300px] rounded-full bg-ochre-400/20 blur-3xl"
            style={{ animation: "risitexFloatA 20s ease-in-out infinite" }}
          />
        </div>
        <Container width="narrow">
          <Reveal>
            <div className="relative text-center">
              <h2 className="mx-auto max-w-3xl font-display text-display-lg text-text-primary md:text-display-xl">
                Ready to grow your business with{" "}
                <span className="text-brand-accent">RISITEX?</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-body-lg text-text-secondary">
                Explore the range, apply for a wholesale account, or talk to our
                team about your requirement.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg">
                  <Link href="/wholesale/catalogue">Browse Catalogue</Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/auth/sign-up">Become a Business Partner</Link>
                </Button>
                <Button asChild size="lg" variant="tertiary">
                  <Link href="/contact">Contact Us</Link>
                </Button>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
