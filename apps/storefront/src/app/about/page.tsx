import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  Boxes,
  Factory,
  ShieldCheck,
  Truck,
  CreditCard,
  RotateCcw,
  Headphones,
  Check,
  Star,
  Instagram,
} from "lucide-react";
import { SmoothScroll, Reveal } from "@/components/site/fx";
import { VexoThemeStyle } from "@/components/site/vexo-theme";
import { MixedHeading, Pill, Watermark } from "@/components/site/vexo";

/**
 * About RISITEX — editorial B2B "about" page on the HOMEPAGE THEME.
 *
 * Rebuilt (2026-07-23, user feedback) to drop the hero image collage for a
 * clean content-led hero, and to adopt the homepage's exact Vexo identity —
 * ivory/ink palette, Space Grotesk with the bold + light-weight "MixedHeading"
 * treatment, sage as the only accent — via <VexoThemeStyle/> + `.rx-vexo`.
 * No warm gold; hover is quiet (lift + shadow, no radial glow).
 *
 * FACTS ARE REAL: Bengaluru, manufacturing since 2019, ~120k pcs/month, four
 * sewing lines, AQL 2.5. The TESTIMONIALS are PLACEHOLDERS (generic roles, no
 * invented named individuals) — replace with real client quotes before ship.
 */

export const metadata: Metadata = {
  title: "About RISITEX — Premium Denim & Essentials Manufacturing",
  description:
    "RISITEX is a Bengaluru manufacturer of premium men's denim, boxer shorts, innerwear and pyjamas — wholesale-first, inspected to AQL 2.5, built for partners who plan to grow.",
  alternates: { canonical: "/about" },
};

const IG_HANDLE = "la_mongie";
const IG_URL = `https://www.instagram.com/${IG_HANDLE}/`;
const PROD = "/demo/products";

const STATS = [
  { icon: Award, value: "2019", label: "Manufacturing since" },
  { icon: Boxes, value: "1,20,000+", label: "Pieces / month" },
  { icon: Factory, value: "4", label: "Sewing lines" },
  { icon: ShieldCheck, value: "AQL 2.5", label: "Quality inspected" },
];

const FEATURES = [
  { icon: Truck, title: "Pan-India delivery", desc: "Nationwide dispatch through trusted logistics, with live order tracking." },
  { icon: CreditCard, title: "Secure B2B payments", desc: "Approved payment methods and clean GST invoicing on every order." },
  { icon: RotateCcw, title: "Dependable reorders", desc: "The tenth run matches the first — consistent make, batch after batch." },
  { icon: Headphones, title: "Dedicated support", desc: "A real person for sampling, quantities, labelling and lead times." },
];

const IG_TILES = [
  `${PROD}/ramy-mamdouh-GchQFkmUHcE-unsplash.jpg`,
  `${PROD}/photo-04.jpg`,
  `${PROD}/daren-inshape-LlZD2SJ0bh8-unsplash.jpg`,
  `${PROD}/hero-model.jpg`,
  `${PROD}/photo-12.jpg`,
  `${PROD}/valeriia-petrova-T0veN4lHLr8-unsplash.jpg`,
  `${PROD}/photo-13.jpg`,
  `${PROD}/tuananh-blue-XdXk39Bj3B0-unsplash.jpg`,
];

const PARTNER_POINTS = [
  "Factory-direct wholesale pricing",
  "OEM & custom manufacturing",
  "Private labelling & branding",
  "Pan-India delivery & GST invoicing",
];

/* ⚠ PLACEHOLDER TESTIMONIALS — generic roles, NOT invented named people.
 * Replace with real, permissioned client quotes before production. */
const TESTIMONIALS = [
  { quote: "The make is consistent order to order — the fit and finish are exactly what our floor needs to reorder with confidence.", who: "Wholesale buyer", where: "Karnataka" },
  { quote: "Clear pricing, dependable dispatch and GST invoices sorted. Sourcing our denim programme has become genuinely easy.", who: "Retail distributor", where: "Maharashtra" },
  { quote: "Private-label support and honest lead times. The craftsmanship speaks for itself — a manufacturer that understands denim.", who: "Growing label", where: "Tamil Nadu" },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-medium uppercase tracking-[0.28em] text-[var(--vx-ink-soft)]">
      {children}
    </p>
  );
}

export default function AboutPage() {
  return (
    <>
      <VexoThemeStyle />
      <SmoothScroll />

      <div className="rx-vexo">
        {/* ════ 1 · HERO — content only, no images ═══════════════════════ */}
        <section className="relative overflow-hidden">
          <Watermark text="Est. 2019" className="text-[26vw]" opacity={0.04} />
          <div className="relative z-10 mx-auto w-full max-w-[var(--vx-max)] px-4 md:px-6 lg:px-8">
            <nav className="flex items-center gap-2 pt-8 text-[12px] text-[var(--vx-ink-soft)]" aria-label="Breadcrumb">
              <Link href="/" className="transition-opacity hover:opacity-70">Home</Link>
              <span aria-hidden>›</span>
              <span className="text-[var(--vx-ink)]">About</span>
            </nav>

            <div className="py-16 md:py-24">
              <Reveal><Eyebrow>About RISITEX</Eyebrow></Reveal>
              <div className="mt-6">
                <MixedHeading
                  as="h1"
                  className="text-[clamp(2.6rem,8vw,6.5rem)] uppercase"
                  lines={[
                    [{ t: "Denim that" }, { t: "defines,", em: true }],
                    [{ t: "quality that" }, { t: "lasts.", em: true }],
                  ]}
                />
              </div>

              <div className="mt-12 grid grid-cols-1 gap-8 pt-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
                <Reveal delay={0.1}>
                  <p className="max-w-[52ch] text-[17px] leading-[1.8] text-[var(--vx-ink-soft)]">
                    RISITEX is a Bengaluru manufacturer of premium men&rsquo;s
                    essentials — jeans, boxer shorts, innerwear and pyjamas. We
                    pair considered fabric with disciplined production to deliver
                    wholesale programmes that hold their quality from the first
                    run to the fiftieth. Every batch is inspected to AQL 2.5, so
                    the tenth carton matches the first.
                  </p>
                </Reveal>
                <Reveal delay={0.2}>
                  <div className="flex flex-col items-start gap-6 lg:items-end">
                    <div className="flex flex-wrap items-center gap-3">
                      <Pill href="/wholesale/catalogue" variant="dark">Get to know us</Pill>
                      <Pill href="/contact" variant="outline">Contact us</Pill>
                    </div>
                    <p className="text-[12px] uppercase tracking-[0.2em] text-[var(--vx-ink-soft)]">
                      Manufacturing in Bengaluru · Since 2019
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        {/* ════ 2 · STATS BAND — dark panel, quiet, no glow ══════════════ */}
        <section className="mx-auto max-w-[var(--vx-max)] px-4 md:px-6 lg:px-8">
          <Reveal>
            <div className="overflow-hidden rounded-[24px] bg-[var(--vx-panel)] shadow-[0_30px_70px_-40px_rgba(0,0,0,0.5)]">
              <div className="grid grid-cols-1 gap-y-8 px-6 py-10 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-0 lg:px-4">
                {STATS.map((s, i) => (
                  <div
                    key={s.label}
                    className={`flex items-center justify-center gap-4 px-2 sm:px-4 ${i > 0 ? "lg:border-l lg:border-[rgba(255,255,255,0.10)]" : ""}`}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.16)] text-[var(--vx-sage)]">
                      <s.icon className="h-6 w-6" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="vx-display block text-[clamp(1.5rem,2.4vw,2rem)] font-extrabold leading-none text-[var(--vx-on-panel)]">
                        {s.value}
                      </span>
                      <span className="mt-2 block text-[12px] uppercase tracking-[0.12em] text-[rgba(237,239,239,0.6)]">
                        {s.label}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ════ 3 · WHY CHOOSE US + INSTAGRAM ════════════════════════════ */}
        <section className="mx-auto max-w-[var(--vx-max)] px-4 py-20 md:px-6 md:py-24 lg:px-8">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2">
            {/* Why choose us */}
            <div>
              <Reveal><Eyebrow>Why choose us</Eyebrow></Reveal>
              <div className="mt-4">
                <MixedHeading
                  className="text-[clamp(1.8rem,3.4vw,2.8rem)] uppercase"
                  lines={[[{ t: "Solutions to grow" }, { t: "your business", em: true }]]}
                />
              </div>
              <Reveal delay={0.1}>
                <span aria-hidden className="mt-6 block h-[3px] w-16 rounded-full bg-[var(--vx-sage)]" />
              </Reveal>

              <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2">
                {FEATURES.map((f, i) => (
                  <Reveal key={f.title} delay={0.12 + (i % 2) * 0.06}>
                    <div className="group">
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--vx-line)] bg-[var(--vx-card)] text-[var(--vx-ink)] shadow-[0_8px_24px_-14px_rgba(20,20,18,0.4)] transition-all duration-500 ease-out group-hover:-translate-y-1 group-hover:border-[var(--vx-sage)]">
                        <f.icon className="h-6 w-6" aria-hidden />
                      </span>
                      <h3 className="mt-4 text-[15px] font-semibold text-[var(--vx-ink)]">{f.title}</h3>
                      <p className="mt-2 text-[14px] leading-relaxed text-[var(--vx-ink-soft)]">{f.desc}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>

            {/* Instagram wall */}
            <div>
              <Reveal>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Eyebrow>Follow our journey</Eyebrow>
                    <div className="mt-4">
                      <MixedHeading
                        className="text-[clamp(1.6rem,2.8vw,2.3rem)] uppercase"
                        lines={[[{ t: "Find us on" }, { t: "Instagram", em: true }]]}
                      />
                    </div>
                    <a href={IG_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-[14px] text-[var(--vx-ink-soft)] transition-opacity hover:opacity-70">
                      <Instagram className="h-4 w-4" aria-hidden /> @{IG_HANDLE}
                    </a>
                  </div>
                  <a href={IG_URL} target="_blank" rel="noopener noreferrer" className="group inline-flex shrink-0 items-center gap-2 pt-2 text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--vx-ink-soft)] transition-colors hover:text-[var(--vx-ink)]">
                    View more
                    <ArrowRight className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1" aria-hidden />
                  </a>
                </div>
              </Reveal>

              <Reveal delay={0.12}>
                <div className="mt-6 grid grid-cols-4 gap-2">
                  {IG_TILES.map((src, i) => (
                    <a
                      key={i}
                      href={IG_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`RISITEX on Instagram (@${IG_HANDLE})`}
                      className="group relative block aspect-square overflow-hidden rounded-[14px]"
                    >
                      <Image src={src} alt="" fill sizes="120px" className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-110" />
                      <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-[rgba(11,8,8,0)] opacity-0 transition-all duration-500 group-hover:bg-[rgba(11,8,8,0.32)] group-hover:opacity-100">
                        <Instagram className="h-5 w-5 text-white" />
                      </span>
                    </a>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ════ 4 · BECOME A PARTNER ═════════════════════════════════════ */}
        <section className="mx-auto max-w-[var(--vx-max)] px-4 pb-20 md:px-6 md:pb-24 lg:px-8">
          <Reveal y={26}>
            <div className="grid grid-cols-1 overflow-hidden rounded-[28px] border border-[var(--vx-line)] bg-[var(--vx-card)] shadow-[0_40px_90px_-55px_rgba(20,20,18,0.5)] lg:grid-cols-2">
              <div className="relative min-h-[280px] lg:min-h-[440px]">
                <Image src={`${PROD}/daren-inshape-LlZD2SJ0bh8-unsplash.jpg`} alt="Inside the RISITEX programme" fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />
              </div>
              <div className="flex items-center p-8 md:p-12">
                <div>
                  <Eyebrow>Become our partner</Eyebrow>
                  <div className="mt-4">
                    <MixedHeading
                      className="text-[clamp(1.8rem,3.2vw,2.6rem)] uppercase"
                      lines={[[{ t: "Become a" }, { t: "supplier partner", em: true }]]}
                    />
                  </div>
                  <ul className="mt-8 space-y-4">
                    {PARTNER_POINTS.map((p) => (
                      <li key={p} className="flex items-center gap-3 text-[15px] text-[var(--vx-ink-soft)]">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--vx-ink)] text-[var(--vx-bg)]">
                          <Check className="h-4 w-4" aria-hidden />
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    <Pill href="/auth/sign-up" variant="dark">Partner with us</Pill>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ════ 5 · TESTIMONIALS (placeholder) ═══════════════════════════ */}
        <section className="mx-auto max-w-[var(--vx-max)] border-t border-[var(--vx-line)] px-4 py-20 md:px-6 md:py-24 lg:px-8">
          <Reveal>
            <div className="text-center">
              <Eyebrow>What our clients say</Eyebrow>
              <div className="mt-4">
                <MixedHeading
                  align="center"
                  className="text-[clamp(2rem,4vw,3.2rem)] uppercase"
                  lines={[[{ t: "Trusted by businesses" }, { t: "across India", em: true }]]}
                />
              </div>
            </div>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={i} delay={i * 0.09} y={24}>
                <figure className="flex h-full flex-col rounded-[22px] border border-[var(--vx-line)] bg-[var(--vx-card)] p-8 shadow-[0_18px_50px_-34px_rgba(20,20,18,0.35)] transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_30px_70px_-34px_rgba(20,20,18,0.5)]">
                  <span aria-hidden className="vx-display text-[46px] leading-none text-[var(--vx-sage)]">&ldquo;</span>
                  <blockquote className="mt-2 flex-1 text-[15px] leading-relaxed text-[var(--vx-ink-soft)]">
                    {t.quote}
                  </blockquote>
                  <div className="mt-6 flex items-center gap-1 text-[var(--vx-ink)]">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} className="h-4 w-4 fill-current" aria-hidden />
                    ))}
                  </div>
                  <figcaption className="mt-5 border-t border-[var(--vx-line)] pt-4">
                    <span className="block text-[14px] font-semibold text-[var(--vx-ink)]">{t.who}</span>
                    <span className="block text-[12px] text-[var(--vx-ink-soft)]">{t.where}</span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.2}>
            <div className="mt-12 flex flex-col items-center gap-4 text-center">
              <p className="text-[15px] text-[var(--vx-ink-soft)]">
                Ready to build your next programme with RISITEX?
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Pill href="/wholesale/catalogue" variant="dark">Browse catalogue</Pill>
                <Link href="/contact" className="group inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--vx-ink-soft)] transition-colors hover:text-[var(--vx-ink)]">
                  Talk to our team
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </div>
    </>
  );
}
