import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/site/container";
import { SignedOut, SignedIn } from "@/components/auth/signed-out";
import { Arrivals, type Arrival } from "@/components/site/arrivals";
import { getWholesaleProducts } from "@/lib/wholesale-products";
import type { Product } from "@/data/products";
import { FaqList } from "@/components/site/faq";
import { SmoothScroll, Cursor, Reveal, Lines, RevealImage, Magnetic } from "@/components/site/fx";

/**
 * Homepage — "Cut From The Same Cloth".
 *
 * Direction agreed after five rejected iterations. The thing that finally
 * explained them: every previous attempt was on CREAM, while mith.tech — the
 * site the user holds up as the standard — is PURE BLACK with one characterful
 * face and scroll motion. It has no 3D and no custom cursor at all; the depth
 * they were describing is contrast + motion. Palette was the variable nobody
 * changed.
 *
 * THE WHOLE PAGE FOLLOWS THE THEME. An earlier pass pinned the photographic
 * spine to ink in both themes on the theory that white type over photography
 * needs a dark plate; the user rejected that outright — clicking light mode
 * must turn the entire homepage light. So every surface here uses semantic
 * tokens, and scrims are built from `--rx-plate` (the current surface as an RGB
 * triplet, flipped in the <style> block) so a photo always fades into the real
 * background instead of into a hardcoded black.
 *
 * Content is a narrative, not a stack: Thread → Loom → Cut → Carton, so
 * scrolling is a garment being made.
 *
 * HARD RULES (each has shipped a bug here):
 *   - NEVER a colour alpha modifier (`bg-x/90`, `text-x/60`). Semantic colours
 *     are plain `var(--…)` with no <alpha-value> → Tailwind emits NOTHING and
 *     the element renders transparent. Use `opacity-*` or an explicit rgba().
 *   - Spacing keys are a REPLACED scale: 0 px 0.5 1 2 3 4 5 6 8 10 12 16 20 24
 *     32 only. Anything else (7, 14, 44, 1.5…) emits nothing → arbitrary [Npx].
 *   - `text-display-*` caps at 104px — far too small for a hero. Display type
 *     uses arbitrary viewport clamps.
 *   - `--brand-accent` is #222222 (monochrome), NOT the indigo semantic.ts
 *     claims. styles.css wins. Probe the browser, don't read the TS.
 */

/**
 * The grid is fed from the LIVE Medusa catalogue — never fixtures.
 *
 * It used to be eight hardcoded demo garments with invented GSM/MOQ. Those are
 * gone: the homepage now shows exactly what is orderable, so it can never
 * advertise a product that does not exist. `getWholesaleProducts()` already
 * merges live + fixtures, and `data/products.ts` PRODUCTS is `[]`, so this is
 * live-only. Add a product in admin and it appears here; unpublish it and it
 * leaves. Tabs derive from the products' real categories rather than a fixed
 * list, so we can't show a tab that filters to nothing.
 */
function toArrivals(products: Product[]): Arrival[] {
  return products
    // A card is a photograph — one without art renders as a broken tile, so a
    // product with no image is skipped rather than shown empty.
    .map((p) => ({ p, art: p.image ?? p.images?.[0] }))
    .filter((x): x is { p: Product; art: string } => Boolean(x.art))
    .slice(0, 8)
    .map(({ p, art }) => ({
      href: `/wholesale/p/${p.slug}`,
      name: p.name,
      cat: p.subcategory?.trim() || "Essentials",
      spec: p.specs?.[0]?.value ?? "",
      moq: p.moq ? `${p.moq} pcs` : "On request",
      image: art,
      hover: p.images?.find((i) => i !== art) ?? art,
    }));
}

/**
 * The narrative spine: fabric → colour → craft → delivery.
 *
 * `title` is an ARRAY OF LINES, not a sentence — <Lines> clips each entry to
 * exactly one line height, so anything that wraps gets guillotined. Break by
 * hand and keep each line short enough to hold at the clamp's max size.
 */
const CHAPTERS = [
  {
    n: "01",
    kicker: "The Fabric",
    title: ["Every great garment", "starts with the", "right fabric."],
    body: "Comfort begins long before the first stitch. Every fabric is selected for softness, durability and breathability, ensuring every garment delivers lasting performance and everyday comfort.",
    image: "/demo/products/photo-09.jpg",
    meta: [{ k: "Fabric", v: "Premium cotton blends" }, { k: "Origin", v: "Carefully sourced" }],
  },
  {
    n: "02",
    kicker: "The Colour",
    title: ["Then comes", "character."],
    body: "From timeless indigo denim to refined everyday shades, every colour is developed for consistency, lasting richness and dependable performance through repeated wear.",
    image: "/demo/products/photo-12.jpg",
    meta: [{ k: "Colour fastness", v: "High" }, { k: "Finish", v: "Premium washes" }],
    align: "right" as const,
  },
  {
    n: "03",
    kicker: "The Craft",
    title: ["Every stitch", "has a purpose."],
    body: "Precision cutting, reinforced construction and careful finishing ensure every pair of jeans, boxer shorts and pyjamas is built to last and made to be worn every day.",
    image: "/demo/products/photo-07.jpg",
    meta: [{ k: "Quality", v: "100% checked" }, { k: "Construction", v: "Precision tailoring" }],
  },
  {
    n: "04",
    kicker: "Ready to Deliver",
    title: ["Prepared for", "your business."],
    body: "Each order is inspected, packed and dispatched with consistency, giving retailers dependable products that arrive ready for shelves and customers.",
    image: "/demo/products/photo-13.jpg",
    meta: [{ k: "MOQ", v: "Business friendly" }, { k: "Lead time", v: "Reliable delivery" }],
    align: "right" as const,
  },
];

const TRADE = [
  { n: "01", t: "Verified business platform", d: "Business-only access for retailers, distributors and wholesale buyers." },
  { n: "02", t: "Competitive wholesale pricing", d: "Factory-direct pricing designed to improve your margins." },
  { n: "03", t: "Reliable inventory", d: "Clear stock visibility and dependable production planning." },
  { n: "04", t: "Transparent order tracking", d: "Track every order from confirmation to dispatch." },
  { n: "05", t: "GST ready", d: "Professional GST invoices and complete order records." },
  { n: "06", t: "Dedicated business support", d: "Real people helping you source with confidence." },
];

const FAQS = [
  { q: "What is the minimum order quantity?", a: "Most products start from 240 pieces per SKU, while selected collections may be available with lower trial quantities." },
  { q: "Who can purchase from Risitex?", a: "Risitex is exclusively for retailers, distributors, wholesalers and registered business buyers." },
  { q: "What payment options do you offer?", a: "We support secure business payments through approved payment methods shared during order confirmation." },
  { q: "Do you deliver across India?", a: "Yes. We deliver across India through trusted logistics partners." },
  { q: "How long does production take?", a: "Lead times generally range from 10–35 days depending on product category and order quantity." },
  { q: "Can I request custom manufacturing?", a: "Yes. We support OEM manufacturing, private labelling and custom production for qualifying order volumes." },
];

const MARQUEE = ["Jeans", "Boxer shorts", "Innerwear", "Pyjamas", "Made in India", "Business only"];

/** Ink link with an underline that wipes in from the left. */
function InkLink({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <Link
      href={href}
      data-cursor=""
      className={
        solid
          ? "group relative inline-flex items-center gap-3 overflow-hidden bg-text-primary px-8 py-4 text-caption uppercase tracking-[0.16em] text-surface-background"
          : "group relative inline-flex items-center gap-3 py-4 text-caption uppercase tracking-[0.16em] text-text-primary"
      }
    >
      <Magnetic>
        <span className="inline-flex items-center gap-3">
          {children}
          <span aria-hidden className="transition-transform duration-500 ease-standard group-hover:translate-x-1">→</span>
        </span>
      </Magnetic>
      {!solid ? (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-2 h-px origin-left scale-x-100 bg-border-strong transition-transform duration-500 ease-standard group-hover:scale-x-0"
        />
      ) : null}
    </Link>
  );
}

export default async function HomePage() {
  const arrivals = toArrivals(await getWholesaleProducts());
  // Only offer tabs when there is something to filter — a lone "All" tab above
  // two products is furniture, not navigation.
  const cats = Array.from(new Set(arrivals.map((a) => a.cat)));
  const arrivalCats = cats.length > 1 ? ["All", ...cats] : [];

  return (
    <>
      <style>{`
        @keyframes rx-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .rx-marquee { animation: rx-marquee 38s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .rx-marquee { animation: none !important } }

        /*
         * --rx-plate: the RGB triplet of whatever the page surface currently is.
         * Scrims over photography are built from it, so a photo plate always
         * fades into the real background instead of into a hardcoded black.
         * This is what makes the hero flip properly in light mode — the whole
         * page follows the theme, not just the copy.
         * Selectors mirror @risitex/ui/styles.css exactly; keep them in sync.
         */
        .rx-spine { --rx-plate: 247,247,242; }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .rx-spine { --rx-plate: 10,10,9; }
        }
        :root[data-theme="dark"] .rx-spine { --rx-plate: 10,10,9; }

        /* The custom cursor replaces the pointer on fine-pointer devices only. */
        @media (min-width: 1024px) and (pointer: fine) {
          .rx-spine, .rx-spine a, .rx-spine button { cursor: none }
        }
      `}</style>

      <SmoothScroll />
      <Cursor />

      {/* ══ THE SPINE — ink in BOTH themes, on purpose (see header note) ══ */}
      <div className="rx-spine bg-surface-background text-text-primary">
        {/* ── HERO ─────────────────────────────────────────── */}
        <section className="relative flex h-[92svh] min-h-[560px] w-full flex-col justify-end overflow-hidden">
          {/* Wrapped, not `className="absolute inset-0"` — RevealImage is itself
              `relative`, and Tailwind emits `relative` AFTER `absolute`, so the
              caller's `absolute` loses and the frame collapses to zero height. */}
          <div className="absolute inset-0">
            <RevealImage
              src="/demo/products/photo-04.jpg"
              alt="RISITEX cut-and-sew apparel"
              className="h-full w-full"
              parallax={0.2}
              priority
            />
          </div>
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(var(--rx-plate),0.72) 0%, rgba(var(--rx-plate),0.12) 30%, rgba(var(--rx-plate),0.55) 72%, rgba(var(--rx-plate),0.95) 100%)",
            }}
          />

          <Container className="relative z-10 pb-12">
            <Reveal>
              <p className="text-micro uppercase tracking-[0.3em] opacity-70">
                Est. 2019 · Bengaluru · Made for men
              </p>
            </Reveal>
            <h1 className="mt-6 text-[clamp(2.25rem,7.6vw,7rem)] font-medium leading-[0.92] tracking-[-0.04em]">
              <Lines delay={0.1}>{["Everyday essentials.", "Crafted properly."]}</Lines>
            </h1>
            <div className="mt-10 flex flex-wrap items-end justify-between gap-8 border-t border-border-subtle pt-6">
              <Reveal delay={0.25}>
                <p className="max-w-[44ch] text-body-lg leading-relaxed opacity-75">
                  Premium jeans, boxer shorts, innerwear and pyjamas made with
                  quality fabrics and precise craftsmanship. Built for everyday
                  wear, for retailers and distributors across India.
                </p>
              </Reveal>
              <Reveal delay={0.35}>
                <div className="flex flex-wrap items-center gap-4">
                  <InkLink href="/wholesale/catalogue" solid>Explore Collection</InkLink>
                  <SignedOut><InkLink href="/auth/sign-up">Become a Partner</InkLink></SignedOut>
                  <SignedIn><InkLink href="/b2b/dashboard">Go to Dashboard</InkLink></SignedIn>
                </div>
              </Reveal>
            </div>
          </Container>
        </section>

        {/* ── MARQUEE ──────────────────────────────────────── */}
        <div className="overflow-hidden border-y border-border-subtle py-5">
          <div className="rx-marquee flex w-max whitespace-nowrap">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex shrink-0 items-center" aria-hidden={dup === 1}>
                {MARQUEE.map((m) => (
                  <span key={`${dup}-${m}`} className="flex items-center text-[clamp(1.5rem,3.4vw,3rem)] font-medium uppercase tracking-[-0.02em]">
                    <span className="px-8">{m}</span>
                    <span className="opacity-40">✳</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── NEW ARRIVALS ─────────────────────────────────── */}
        <section className="py-24 md:py-32">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <Reveal>
                  <p className="text-micro uppercase tracking-[0.3em] opacity-55">Our collection</p>
                </Reveal>
                <h2 className="mt-5 text-[clamp(2rem,5vw,4rem)] font-medium leading-[0.95] tracking-[-0.035em]">
                  <Lines>{["Men's essentials.", "Done right."]}</Lines>
                </h2>
              </div>
              <Reveal delay={0.1}>
                <InkLink href="/wholesale/catalogue">View Full Collection</InkLink>
              </Reveal>
            </div>
            <div className="mt-12">
              <Arrivals items={arrivals} cats={arrivalCats} />
            </div>
          </Container>
        </section>

        {/* ── THE FOUR CHAPTERS — the story spine ──────────── */}
        {CHAPTERS.map((c) => (
          <section key={c.n} className="border-t border-border-subtle py-20 md:py-28">
            <Container>
              <div className={`grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16 ${c.align === "right" ? "" : ""}`}>
                <div className={`lg:col-span-6 ${c.align === "right" ? "lg:order-2" : ""}`}>
                  <RevealImage
                    src={c.image}
                    alt={c.kicker}
                    className="aspect-[4/5] w-full"
                    parallax={0.16}
                  />
                </div>
                <div className={`lg:col-span-6 ${c.align === "right" ? "lg:order-1" : ""}`}>
                  <Reveal>
                    <p className="text-micro uppercase tracking-[0.3em] opacity-55">
                      <span className="opacity-100">{c.n}</span>
                      <span className="mx-3">—</span>
                      {c.kicker}
                    </p>
                  </Reveal>
                  <h2 className="mt-5 text-[clamp(2rem,4.6vw,3.75rem)] font-medium leading-[0.98] tracking-[-0.035em]">
                    <Lines>{c.title}</Lines>
                  </h2>
                  <Reveal delay={0.15}>
                    <p className="mt-6 max-w-[46ch] text-body-lg leading-relaxed opacity-70">{c.body}</p>
                  </Reveal>
                  <Reveal delay={0.25}>
                    <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-5 border-t border-border-subtle pt-6">
                      {c.meta.map((m) => (
                        <div key={m.k}>
                          <dt className="text-micro uppercase tracking-[0.2em] opacity-45">{m.k}</dt>
                          <dd className="mt-2 text-body-lg numerics-tabular">{m.v}</dd>
                        </div>
                      ))}
                    </dl>
                  </Reveal>
                </div>
              </div>
            </Container>
          </section>
        ))}

        {/* ── TWO EDITORIAL CARDS (the reference's mid-page pair) ── */}
        <section className="border-t border-border-subtle py-20 md:py-28">
          <Container>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
              {[
                { t: "Order once. Reorder with confidence.", d: "The same fabric, the same fit, every run.", href: "/wholesale/catalogue", img: "/demo/products/photo-05.jpg", cta: "Explore" },
                { t: "Made for business buyers.", d: "Wholesale pricing, clear stock, GST invoices, real support.", href: "/auth/sign-up", img: "/demo/products/images.jpeg", cta: "Apply" },
              ].map((card) => (
                <Link key={card.t} href={card.href} data-cursor={card.cta} className="group relative block aspect-[4/3] overflow-hidden">
                  <Image
                    src={card.img}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="scale-[1.02] object-cover transition-transform duration-[900ms] ease-standard group-hover:scale-[1.08]"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-80"
                    style={{ background: "linear-gradient(0deg, rgba(var(--rx-plate),0.88) 0%, rgba(var(--rx-plate),0.15) 60%, rgba(var(--rx-plate),0) 100%)" }}
                  />
                  <div className="absolute inset-x-0 bottom-0 p-8">
                    <h3 className="max-w-[16ch] text-[clamp(1.5rem,2.6vw,2.25rem)] font-medium leading-[1.05] tracking-[-0.03em]">
                      {card.t}
                    </h3>
                    <p className="mt-3 max-w-[36ch] text-body-sm opacity-70">{card.d}</p>
                    <span className="mt-6 inline-block overflow-hidden">
                      <span className="inline-block border-b border-border-strong pb-1 text-caption uppercase tracking-[0.16em] transition-transform duration-500 ease-standard group-hover:translate-x-2">
                        {card.cta} →
                      </span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </Container>
        </section>

        {/* ── CLOSER — overlapping display type over photography ── */}
        <section className="relative flex h-[80vh] min-h-[460px] items-center justify-center overflow-hidden border-t border-border-subtle">
          <div className="absolute inset-0">
            <RevealImage src="/demo/products/photo-12.jpg" alt="" className="h-full w-full" parallax={0.22} />
          </div>
          {/*
           * Plate + vignette, no ghosted display type.
           * A giant marquee ran behind this headline and it was unreadable —
           * two competing texts at 14vw fighting over the same pixels. The
           * photograph is the interest; the copy just needs to sit on it
           * cleanly. Radial first (focuses the eye centre), then a floor so the
           * buttons never land on a highlight.
           */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 45%, rgba(var(--rx-plate),0.62) 0%, rgba(var(--rx-plate),0.82) 55%, rgba(var(--rx-plate),0.94) 100%)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/3"
            style={{ background: "linear-gradient(0deg, rgba(var(--rx-plate),0.9) 0%, rgba(var(--rx-plate),0) 100%)" }}
          />
          <Container className="relative z-10 text-center">
            <h2 className="text-[clamp(2.25rem,6vw,5rem)] font-medium leading-[0.95] tracking-[-0.04em]">
              <Lines>{["Let's build your", "next collection."]}</Lines>
            </h2>
            <Reveal delay={0.2}>
              <p className="mx-auto mt-6 max-w-[44ch] text-body-lg opacity-70">
                Whether you're a retailer, distributor or growing brand, Risitex
                delivers dependable manufacturing, consistent quality and
                business-first service.
              </p>
            </Reveal>
            <Reveal delay={0.3}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <InkLink href="/auth/sign-up" solid>Create Business Account</InkLink>
                <InkLink href="/contact">Contact Sales</InkLink>
              </div>
            </Reveal>
          </Container>
        </section>
      </div>

      {/* ══ TRADE CONTENT — follows the theme (light-mode support) ══ */}
      <section className="border-b border-border-subtle bg-surface-background py-24 md:py-32">
        <Container>
          <Reveal>
            <p className="text-micro uppercase tracking-[0.3em] text-text-muted">Why Risitex</p>
          </Reveal>
          <h2 className="mt-5 max-w-[18ch] text-[clamp(2rem,4.6vw,3.5rem)] font-medium leading-[0.98] tracking-[-0.035em] text-text-primary">
            <Lines>{["Why businesses", "choose Risitex."]}</Lines>
          </h2>
          <div className="mt-14 border-t border-border-subtle">
            {TRADE.map((f, i) => (
              <Reveal key={f.n} delay={i * 0.04}>
                <div className="group grid grid-cols-1 items-start gap-3 border-b border-border-subtle py-8 transition-colors duration-base hover:bg-surface-sunken md:grid-cols-12 md:gap-6">
                  <span className="text-caption tracking-[0.16em] text-text-muted md:col-span-1 md:pt-2">{f.n}</span>
                  <h3 className="text-heading-sm text-text-primary transition-transform duration-slow ease-standard group-hover:translate-x-2 md:col-span-3">
                    {f.t}
                  </h3>
                  <p className="text-body-md leading-relaxed text-text-secondary md:col-span-8">{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <section className="bg-surface-background py-24 md:py-32">
        {/* Full width on purpose — a 4/8 split parked the heading in a narrow
            column and left a dead gap beside every short question. */}
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Reveal>
                <p className="text-micro uppercase tracking-[0.3em] text-text-muted">FAQ</p>
              </Reveal>
              <h2 className="mt-5 text-[clamp(2rem,4.6vw,3.5rem)] font-medium leading-[1] tracking-[-0.035em] text-text-primary">
                <Lines>{["Questions, answered."]}</Lines>
              </h2>
            </div>
            <Reveal delay={0.1}>
              <Link
                href="/contact"
                data-cursor=""
                className="group inline-flex items-center gap-2 border-b border-text-primary pb-1 text-caption uppercase tracking-[0.16em] text-text-primary transition-colors duration-base hover:border-brand-accent hover:text-brand-accent"
              >
                Still stuck? Talk to us
                <span aria-hidden className="transition-transform duration-base group-hover:translate-x-1">→</span>
              </Link>
            </Reveal>
          </div>
          <Reveal delay={0.15} className="mt-14">
            <FaqList items={FAQS} />
          </Reveal>
        </Container>
      </section>
    </>
  );
}
