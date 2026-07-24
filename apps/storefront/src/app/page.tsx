import Link from "next/link";
import { SignedOut, SignedIn } from "@/components/auth/signed-out";
import { getWholesaleProducts } from "@/lib/wholesale-products";
import type { Product } from "@/data/products";
import { SmoothScroll, Reveal } from "@/components/site/fx";
import { CountUp, HeroSlideshow } from "@/components/site/elegance";
import { FaqList, type Faq } from "@/components/site/faq";
import { VexoThemeStyle } from "@/components/site/vexo-theme";
import {
  MixedHeading,
  Pill,
  Watermark,
  WatermarkMarquee,
  Marquee,
  FloatingCutout,
  FeatureCard,
  ShowcaseFigure,
  ProductGrid,
  type GridItem,
} from "@/components/site/vexo";

/**
 * Homepage — rebuilt against the Vexo eCommerce concept (Zeyox Studio,
 * Dribbble #25931151), chosen by the user as the reference. Layout, motion,
 * palette and the mixed grotesque/italic-serif type all come from that shot;
 * the COPY stays true to RISITEX (a Bengaluru B2B garment manufacturer), per
 * the user's decision — Vexo's streetwear voice, RISITEX's real facts.
 *
 * The previous editorial homepage is preserved at
 * apps/storefront/.backup/page.cocoon.*.tsx (outside the app dir, so Next never
 * compiles it as a route). The navbar and mega-menu are deliberately untouched.
 *
 * IMAGERY: the floating figures and garments are rembg cut-outs of the RISITEX
 * model/product shots, generated into /public/demo/cutouts. The full-frame
 * feature panels use the original photographs. `photo-07`/`images.jpeg` stay
 * excluded everywhere (they carry other brands' labels).
 *
 * THEME: the homepage is THEME-REACTIVE — light in light mode, dark in dark
 * mode. The `.rx-vexo` `--vx-*` palette has a light default and a dark override
 * (`html[data-theme="dark"] .rx-vexo`); the navbar's semantic tokens are forced
 * light ONLY in light mode so the design system's own dark tokens drive it in
 * dark mode; the footer is left to the theme entirely. See the <style> block.
 */

const CUT = "/demo/cutouts";
const PROD = "/demo/products";

/* Hero slideshow — the cross-fading photography the user asked to bring back.
 * Chosen for landscape crops that survive a wide frame and hold white type. */
const HERO_SLIDES = [
  { src: `${PROD}/hero-shorts-wall.jpg`, alt: "RISITEX men's essentials", label: "The range" },
  { src: `${PROD}/photo-12.jpg`, alt: "", label: "Denim" },
  { src: `${PROD}/alan-quirvan-Xr1y8o4rzsU-unsplash.jpg`, alt: "", label: "Made to order" },
  { src: `${PROD}/ramy-mamdouh-GchQFkmUHcE-unsplash.jpg`, alt: "", label: "Summer" },
];

const FEATURES = [
  {
    src: `${PROD}/alan-quirvan-Xr1y8o4rzsU-unsplash.jpg`,
    alt: "RISITEX denim on model",
    eyebrow: "The denim programme",
    title: "Straight, slim & relaxed blocks",
    cta: "View",
    href: "/wholesale/catalogue?cat=jeans",
    tall: true,
  },
  {
    src: `${PROD}/photo-12.jpg`,
    alt: "Denim construction detail",
    eyebrow: "Base cloth & washes",
    title: "Non-lycra and stretch, washed to order",
    cta: "View",
    href: "/wholesale/catalogue?cat=jeans",
    tall: false,
  },
];

const NUMBERS = [
  { v: 120000, suffix: "+", k: "Pieces / month" },
  { v: 4, suffix: "", k: "Sewing lines" },
  { v: 240, suffix: "", k: "MOQ per SKU" },
  { v: 2019, year: true as const, k: "Making since" },
];

/* FAQ — the same set the earlier homepage carried, brought back per request. */
const FAQS: Faq[] = [
  { q: "What is the minimum order quantity?", a: "Most products start from 240 pieces per SKU, while selected collections may be available with lower trial quantities." },
  { q: "Who can purchase from Risitex?", a: "Risitex is exclusively for retailers, distributors, wholesalers and registered business buyers." },
  { q: "What payment options do you offer?", a: "We support secure business payments through approved payment methods shared during order confirmation." },
  { q: "Do you deliver across India?", a: "Yes. We deliver across India through trusted logistics partners." },
  { q: "How long does production take?", a: "Lead times generally range from 10–35 days depending on product category and order quantity." },
  { q: "Can I request custom manufacturing?", a: "Yes. We support OEM manufacturing, private labelling and custom production for qualifying order volumes." },
];

/**
 * LIVE CATALOGUE ONLY — no demo fallback. If the store has no published
 * products with imagery, the grid section simply doesn't render. The live
 * site must never advertise a product that does not exist (user requirement,
 * 2026-07-23).
 */
function toGrid(products: Product[]): GridItem[] {
  return products
    .map((p) => ({ p, art: p.image ?? p.images?.[0] }))
    .filter((x): x is { p: Product; art: string } => Boolean(x.art))
    .slice(0, 8)
    .map(({ p, art }) => ({
      href: `/wholesale/p/${p.slug}`,
      name: p.name,
      cat: p.subcategory?.trim() || "Essentials",
      moq: p.moq ? `${p.moq} pcs` : "On request",
      image: art,
      hover: p.images?.find((i) => i !== art) ?? art,
    }));
}

export default async function HomePage() {
  const products = await getWholesaleProducts();
  const grid = toGrid(products);

  return (
    <>
      <VexoThemeStyle />

      <SmoothScroll />

      <div className="rx-vexo">
        {/* ════ HERO — full-bleed cross-fading photography ══════════════════
         * The user asked to bring back the earlier MOVING-IMAGE hero (a slow
         * cross-fade slideshow) instead of the standing cut-out, kept tighter
         * and carrying the current copy. White type over a dark scrim reads in
         * BOTH themes — the hero background does not flip with the theme, so its
         * text colour must not either. HeroSlideshow supplies the cross-fade +
         * ambient orbit (rx-ambient / rx-bar keyframes are defined above).
         */}
        <section className="relative flex min-h-[76svh] items-center overflow-hidden rounded-b-[28px] md:min-h-[82svh] md:rounded-b-[40px]">
          <HeroSlideshow slides={HERO_SLIDES} />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(11,8,8,0.36) 0%, rgba(11,8,8,0.18) 42%, rgba(11,8,8,0.28) 70%, rgba(11,8,8,0.66) 100%)" }}
          />
          <div className="relative z-10 mx-auto w-full max-w-[var(--vx-max)] px-4 py-20 text-center md:px-6 lg:px-8">
            <Reveal>
              <p className="text-[12px] uppercase tracking-[0.3em] text-white opacity-75">
                Bengaluru · Manufacturing since 2019
              </p>
            </Reveal>
            <div className="mt-5">
              <MixedHeading
                as="h1"
                align="center"
                tone="invert"
                className="text-[clamp(2.2rem,6vw,5rem)] uppercase"
                lines={[
                  [{ t: "Built for every" }, { t: "season,", em: true }],
                  [{ t: "made for every" }, { t: "floor.", em: true }],
                ]}
              />
            </div>
            <Reveal delay={0.25}>
              <p className="mx-auto mt-6 max-w-[52ch] text-[16px] leading-[1.7] text-white opacity-85">
                Premium jeans, boxer shorts, innerwear and pyjamas — made in
                Bengaluru for retailers and distributors across India.
              </p>
            </Reveal>
            <Reveal delay={0.35}>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Pill href="/wholesale/catalogue" variant="solid">Explore catalogue</Pill>
                <SignedOut>
                  <Pill href="/auth/sign-up" variant="outline-invert">Become a partner</Pill>
                </SignedOut>
                <SignedIn>
                  <Pill href="/b2b/dashboard" variant="outline-invert">Go to dashboard</Pill>
                </SignedIn>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ════ FLOATING GARMENTS — the "programme" transition ═══════════ */}
        <section className="relative overflow-hidden py-16 md:py-24">
          <Watermark text="Wholesale" className="text-[24vw]" opacity={0.05} />
          <div className="relative z-10 mx-auto grid max-w-[var(--vx-max)] grid-cols-1 items-center gap-10 px-4 md:px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <MixedHeading
                className="text-[clamp(2rem,4.4vw,3.6rem)] uppercase"
                lines={[[{ t: "The denim" }, { t: "programme", em: true }]]}
              />
              <Reveal delay={0.15}>
                <p className="mt-6 max-w-[42ch] text-[16px] leading-[1.7] text-[var(--vx-ink-soft)]">
                  Four sewing lines in Bengaluru, working to AQL 2.5. Straight,
                  slim and relaxed blocks in non-lycra and stretch — washed to
                  your colourway, cut for a working retail floor.
                </p>
              </Reveal>
              <Reveal delay={0.25}>
                <div className="mt-8">
                  <Pill href="/wholesale/catalogue?cat=jeans" variant="dark">Browse the denim</Pill>
                </div>
              </Reveal>
            </div>
            {/* three floating garments at different parallax speeds */}
            <div className="relative flex items-end justify-center gap-4 md:gap-8">
              <FloatingCutout src={`${CUT}/jeans-dark.png`} alt="Dark wash denim" width={180} strength={22} bob={10} className="mb-10 w-[30%]" />
              <FloatingCutout src={`${CUT}/jeans-hanger.png`} alt="Denim on hanger" width={230} strength={12} bob={16} className="w-[40%]" />
              <FloatingCutout src={`${CUT}/jeans-light.png`} alt="Light wash denim" width={180} strength={30} bob={8} className="mb-16 w-[30%]" />
            </div>
          </div>
        </section>

        {/* ════ FEATURE PANELS ══════════════════════════════════════════ */}
        <section className="mx-auto max-w-[1560px] px-4 md:px-6 lg:px-10">
          <div className="mb-10">
            <MixedHeading
              className="text-[clamp(2rem,4.4vw,3.6rem)] uppercase"
              lines={[
                [{ t: "Made for the" }, { t: "floor,", em: true }],
                [{ t: "finished to" }, { t: "last.", em: true }],
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-5 md:gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <FeatureCard {...FEATURES[0]!} />
            <FeatureCard {...FEATURES[1]!} />
          </div>
        </section>

        {/* ════ SHOWCASE — centred figure over CONTINUOUSLY MOVING type ═════
         * Exactly the reference's treatment: one clean cut-out in the middle,
         * and a giant faint word train gliding left behind it, edge to edge. */}
        <section className="relative overflow-hidden py-14 md:py-20">
          <WatermarkMarquee text="Everyday Essentials" className="text-[13vw]" opacity={0.06} seconds={46} />
          <div className="relative z-10 mx-auto max-w-[var(--vx-max)] px-4 text-center md:px-6 lg:px-8">
            <MixedHeading
              align="center"
              className="text-[clamp(2rem,4.4vw,3.6rem)] uppercase"
              lines={[[{ t: "With the latest in" }, { t: "everyday", em: true }, { t: "essentials" }]]}
            />
            <div className="mt-10">
              <ShowcaseFigure src={`${CUT}/figure-torso.png`} alt="RISITEX everyday essentials" width={310} />
            </div>
            <Reveal delay={0.2}>
              <div className="mt-10 flex items-center justify-center gap-4">
                <Pill href="/wholesale/catalogue?cat=innerwear" variant="dark" size="lg">Shop essentials</Pill>
                <Pill href="/about" variant="outline" size="lg">Our process</Pill>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ════ MARQUEE — moving text band (reference's sliding headline) ═══ */}
        <section className="mt-14 border-y border-[var(--vx-line)] py-6 md:mt-20 md:py-10">
          <Marquee
            items={["Premium Denim", "Boxer Shorts", "Innerwear", "Pyjamas", "Made in Bengaluru"]}
          />
        </section>

        {/* ════ PRODUCT GRID — live catalogue ═══════════════════════════
         * Generous mt separates this from the marquee band's border above —
         * the heading was sitting right on that rule and read as suffocated.
         * Header is CENTRED (heading + catalogue link stacked), per request.
         * REAL PRODUCTS ONLY: the whole section is skipped when the live
         * catalogue has nothing to show. */}
        {grid.length > 0 ? (
        <section className="mx-auto mt-16 max-w-[var(--vx-max)] px-4 md:mt-24 md:px-6 lg:px-8">
          {/* Heading left, catalogue link on the right — not centred (user
              request 2026-07-23). */}
          <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
            <MixedHeading
              className="text-[clamp(2rem,4.4vw,3.6rem)] uppercase"
              lines={[[{ t: "Fresh blocks for your" }, { t: "next", em: true }, { t: "order" }]]}
            />
            <Reveal delay={0.1}>
              <Link
                href="/wholesale/catalogue"
                className="group inline-flex items-center gap-2 pb-2 text-[12px] uppercase tracking-[0.2em] text-[var(--vx-ink-soft)] transition-colors hover:text-[var(--vx-ink)]"
              >
                View full catalogue
                <span aria-hidden className="transition-transform duration-500 group-hover:translate-x-1">→</span>
              </Link>
            </Reveal>
          </div>
          <ProductGrid items={grid} />
        </section>
        ) : null}

        {/* ════ STATS ═══════════════════════════════════════════════════ */}
        <section className="mx-auto mt-14 max-w-[var(--vx-max)] px-4 md:mt-24 md:px-6 lg:px-8">
          <div className="rounded-[26px] border border-[var(--vx-line)] bg-[var(--vx-card)] px-6 py-12 md:px-10">
            {/* Dividers between columns so the wide "1,20,000+" and the small
                "4" read as two separate stats, never one run of text. */}
            <div className="grid grid-cols-2 gap-y-12 lg:grid-cols-4">
              {NUMBERS.map((n, i) => {
                const mobRight = i % 2 === 1;
                const deskFirst = i % 4 === 0;
                const cls = [
                  mobRight ? "border-l border-[var(--vx-line)] pl-5" : "",
                  deskFirst
                    ? "lg:border-l-0 lg:pl-0"
                    : "lg:border-l lg:border-[var(--vx-line)] lg:pl-8",
                ].join(" ");
                return (
                  <Reveal key={n.k} delay={i * 0.08}>
                    <div className={cls}>
                      <p className="vx-display text-[clamp(1.4rem,6vw,3.25rem)] font-extrabold leading-none tracking-[-0.02em]">
                        <CountUp to={n.v} suffix={"suffix" in n ? n.suffix : ""} year={"year" in n ? n.year : false} />
                      </p>
                      <p className="mt-3 text-[12px] uppercase tracking-[0.2em] text-[var(--vx-ink-soft)]">
                        {n.k}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ════ FAQ — brought back from the earlier homepage ════════════ */}
        <section className="mx-auto mb-20 mt-16 max-w-[var(--vx-max)] px-4 md:mb-24 md:mt-24 md:px-6 lg:px-8">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <MixedHeading
              className="text-[clamp(2rem,4.4vw,3.6rem)] uppercase"
              lines={[[{ t: "Questions," }, { t: "answered", em: true }]]}
            />
            <Reveal delay={0.1}>
              <Link
                href="/contact"
                className="group inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.2em] text-[var(--vx-ink-soft)] transition-colors hover:text-[var(--vx-ink)]"
              >
                Still have questions? Talk to us
                <span aria-hidden className="transition-transform duration-500 group-hover:translate-x-1">→</span>
              </Link>
            </Reveal>
          </div>
          <FaqList items={FAQS} />
        </section>
      </div>
    </>
  );
}
