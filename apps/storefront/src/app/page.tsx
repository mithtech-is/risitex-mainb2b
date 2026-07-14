import Link from "next/link";
import Image from "next/image";
import {
  ShieldCheck,
  BadgePercent,
  Boxes,
  Truck,
  ReceiptText,
  Handshake,
} from "lucide-react";
import { Button } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { SignedOut, SignedIn } from "@/components/auth/signed-out";

const CATEGORIES = [
  {
    href: "/wholesale/catalogue?cat=men-innerwear",
    label: "Innerwear",
    desc: "Inner boxers, boxer shorts",
    image: "/demo/products/photo-05.jpg",
  },
  {
    href: "/wholesale/catalogue?cat=men-bottom-wear",
    label: "Bottom Wear",
    desc: "Pyjamas, jeans, trousers",
    image: "/demo/products/images.jpeg",
  },
  {
    href: "/wholesale/catalogue?cat=men-jeans",
    label: "Jeans",
    desc: "Slim, straight, tapered & more",
    image: "/demo/products/jeans-light-blue.jpg",
  },
  {
    href: "/wholesale/catalogue?cat=men-pyjamas",
    label: "Pyjamas",
    desc: "Comfort loungewear & nightwear",
    image: "/demo/products/jeans-dark-blue.jpg",
  },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Verified Wholesale Platform",
    desc: "Only verified retailers, distributors, and business buyers can place wholesale orders, ensuring a secure B2B marketplace.",
    chip: "bg-indigo-500",
    bar: "bg-indigo-500",
  },
  {
    icon: BadgePercent,
    title: "Business Pricing Engine",
    desc: "Access tier-based pricing, bulk discounts, and volume incentives tailored to your business profile.",
    chip: "bg-ochre-500",
    bar: "bg-ochre-500",
  },
  {
    icon: Boxes,
    title: "Intelligent Inventory",
    desc: "Monitor live inventory, production capacity, and lead times so you can plan procurement with confidence.",
    chip: "bg-sage-500",
    bar: "bg-sage-500",
  },
  {
    icon: Truck,
    title: "End-to-End Order Visibility",
    desc: "Track your order from approval through dispatch and delivery, with real-time shipment updates and downloadable invoices.",
    chip: "bg-madder-500",
    bar: "bg-madder-500",
  },
  {
    icon: ReceiptText,
    title: "GST & Business Compliance",
    desc: "Receive GST-ready invoices, complete order history, and business documentation designed for accounting and compliance.",
    chip: "bg-slate-cool-500",
    bar: "bg-slate-cool-500",
  },
  {
    icon: Handshake,
    title: "Dedicated Relationship Support",
    desc: "Our team assists with quotations, sourcing, logistics, and ongoing wholesale requirements to help your business grow.",
    chip: "bg-indigo-500",
    bar: "bg-indigo-500",
  },
];

const INDUSTRIES = [
  { href: "/wholesale/catalogue", label: "Retail Chains", desc: "Multi-brand stores and retail networks" },
  { href: "/wholesale/catalogue", label: "Hospitality", desc: "Hotels, resorts, and serviced apartments" },
  { href: "/wholesale/catalogue", label: "Corporate", desc: "Uniform programmes and bulk corporate orders" },
  { href: "/wholesale/catalogue", label: "E-commerce Sellers", desc: "Online retailers and marketplace sellers" },
];

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border-subtle bg-gradient-to-br from-surface-background via-surface-sunken to-surface-background">
        <Container>
          <div className="grid grid-cols-1 gap-12 py-16 md:py-24 lg:grid-cols-12 lg:gap-10 lg:py-32">
            <div className="flex flex-col justify-center lg:col-span-7 xl:col-span-6">
              <p className="text-micro uppercase tracking-[0.18em] text-text-muted">
                India&rsquo;s Premium B2B Textile Platform
              </p>
              <h1 className="mt-4 text-display-xl text-text-primary">
                Manufactured in India.
                <br />
                <span className="font-display italic">Priced for Volume.</span>
              </h1>
              <p className="mt-6 max-w-prose text-body-lg text-text-secondary">
                RISITEX connects textile manufacturers directly with dealers,
                distributors, retailers, and businesses. Premium innerwear,
                loungewear, and fabrics at factory-direct wholesale pricing.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/wholesale/catalogue">Browse Catalogue</Link>
                </Button>
                <SignedOut>
                  <Button variant="secondary" size="lg" asChild>
                    <Link href="/auth/sign-in">Sign In &rarr;</Link>
                  </Button>
                </SignedOut>
                <SignedIn>
                  <Button variant="secondary" size="lg" asChild>
                    <Link href="/b2b/dashboard">Open dashboard &rarr;</Link>
                  </Button>
                </SignedIn>
              </div>
              <SignedOut>
                <p className="mt-3 text-body-sm text-text-muted">
                  Don&rsquo;t have an account?{" "}
                  <Link
                    href="/auth/sign-up"
                    className="text-text-primary underline-offset-4 hover:underline"
                  >
                    Register your business
                  </Link>
                </p>
              </SignedOut>

              <div className="mt-12 grid grid-cols-3 gap-6">
                <div>
                  <p className="text-heading-lg text-text-primary numerics-tabular">500+</p>
                  <p className="text-caption text-text-muted">Products</p>
                </div>
                <div>
                  <p className="text-heading-lg text-text-primary numerics-tabular">50+</p>
                  <p className="text-caption text-text-muted">Dealers Nationwide</p>
                </div>
                <div>
                  <p className="text-heading-lg text-text-primary numerics-tabular">10</p>
                  <p className="text-caption text-text-muted">Years of Excellence</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 xl:col-span-6">
              <div className="group relative aspect-[4/5] w-full overflow-hidden rounded-xl ring-1 ring-border-subtle shadow-rest">
                <Image
                  src="/demo/products/photo-07.jpg"
                  alt="RISITEX wholesale textiles — manufactured in India"
                  fill
                  priority
                  sizes="(min-width: 1280px) 50vw, (min-width: 1024px) 42vw, 100vw"
                  className="object-cover transition-transform duration-slow ease-standard group-hover:scale-[1.02]"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"
                />
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3 rounded-md bg-surface-background/85 px-4 py-2.5 backdrop-blur-modal">
                  <div>
                    <p className="text-micro uppercase tracking-[0.2em] text-text-muted">
                      Bangalore · Karnataka
                    </p>
                    <p className="mt-0.5 text-body-sm text-text-primary">
                      Factory-direct, GST-invoiced, palletised dispatch
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* CATEGORIES */}
      <section className="border-b border-border-subtle py-16 md:py-20">
        <Container>
          <div className="text-center">
            <p className="text-micro text-text-muted">Product Categories</p>
            <h2 className="mt-2 text-heading-xl text-text-primary">
              Explore Our Range
            </h2>
            <p className="mt-3 text-body-lg text-text-secondary max-w-2xl mx-auto">
              Premium textile products across categories, available for wholesale
              and bulk orders.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.label}
                href={cat.href}
                className="group block rounded-lg focus-visible:ring-focus"
              >
                <article className="flex flex-col gap-3">
                  <div className="relative aspect-square overflow-hidden rounded-lg ring-1 ring-border-subtle bg-surface-sunken transition-all duration-base ease-standard group-hover:-translate-y-1 group-hover:shadow-raised">
                    <Image
                      src={cat.image}
                      alt={cat.label}
                      fill
                      sizes="(min-width: 768px) 25vw, 50vw"
                      className="object-cover transition-transform duration-normal ease-standard group-hover:scale-[1.04]"
                    />
                  </div>
                  <h3 className="text-body-md font-medium text-text-primary">
                    {cat.label}
                  </h3>
                  <p className="text-body-sm text-text-muted">{cat.desc}</p>
                </article>
              </Link>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button variant="secondary" asChild>
              <Link href="/wholesale/catalogue">View Full Catalogue &rarr;</Link>
            </Button>
          </div>
        </Container>
      </section>

      {/* WHY RISITEX */}
      <section className="border-b border-border-subtle py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-micro font-semibold uppercase tracking-[0.2em] text-brand-accent">
              Why RISITEX
            </p>
            <h2 className="mt-3 font-display text-display-lg text-text-primary">
              Built for{" "}
              <span className="relative whitespace-nowrap">
                Wholesale
                <span
                  aria-hidden
                  className="absolute -bottom-1 left-0 h-1 w-full rounded-full bg-ochre-400"
                />
              </span>
            </h2>
            <p className="mt-4 text-body-md text-text-secondary">
              Everything a serious B2B buyer needs — from verification to
              delivery — engineered into one platform.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised p-6 transition-all duration-base ease-standard hover:-translate-y-1 hover:border-border-strong hover:shadow-popover"
              >
                {/* solid colour chip — tilts + grows on hover */}
                <span
                  className={`relative inline-flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-rest transition-transform duration-base ease-standard group-hover:-rotate-6 group-hover:scale-110 ${f.chip}`}
                >
                  <f.icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="relative mt-5 font-display text-heading-md text-text-primary">
                  {f.title}
                </h3>
                <p className="relative mt-2 text-body-md leading-relaxed text-text-secondary">
                  {f.desc}
                </p>
                {/* constant colour accent along the bottom edge */}
                <span
                  aria-hidden
                  className={`absolute inset-x-0 bottom-0 h-1 ${f.bar}`}
                />
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* INDUSTRIES */}
      <section className="border-b border-border-subtle py-16 md:py-20 bg-surface-sunken">
        <Container>
          <div className="text-center">
            <p className="text-micro text-text-muted">Buyer Segments</p>
            <h2 className="mt-2 text-heading-xl text-text-primary">
              Who We Partner With
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {INDUSTRIES.map((ind) => (
              <Link
                key={ind.label}
                href={ind.href}
                className="group block rounded-lg border border-border-subtle bg-surface-background p-6 transition-all duration-base hover:shadow-raised"
              >
                <h3 className="text-heading-sm text-text-primary group-hover:text-brand-accent">
                  {ind.label}
                </h3>
                <p className="mt-2 text-body-md text-text-secondary">
                  {ind.desc}
                </p>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* MANUFACTURING CAPABILITIES */}
      <section className="border-b border-border-subtle py-16 md:py-20">
        <Container>
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-5">
              <p className="text-micro text-text-muted">Production Standards</p>
              <h2 className="mt-3 text-display-lg text-text-primary">
                Vertically Integrated Manufacturing
              </h2>
              <p className="mt-4 text-body-lg text-text-secondary">
                From fibre to finished garment, our facilities in Karnataka
                handle every stage of production with rigorous quality control.
              </p>
              <ul className="mt-6 space-y-3">
                <li className="flex items-start gap-3 text-body-md text-text-secondary">
                  <span aria-hidden className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-accent shrink-0" />
                  Spinning &amp; weaving units
                </li>
                <li className="flex items-start gap-3 text-body-md text-text-secondary">
                  <span aria-hidden className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-accent shrink-0" />
                  Dyeing &amp; finishing facilities
                </li>
                <li className="flex items-start gap-3 text-body-md text-text-secondary">
                  <span aria-hidden className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-accent shrink-0" />
                  Cutting, sewing &amp; packaging lines
                </li>
                <li className="flex items-start gap-3 text-body-md text-text-secondary">
                  <span aria-hidden className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-accent shrink-0" />
                  In-house quality testing lab
                </li>
              </ul>
              <div className="mt-8">
                <Button variant="secondary" asChild>
                  <Link href="/about">Explore RISITEX &rarr;</Link>
                </Button>
              </div>
            </div>
            <div className="lg:col-span-7">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl ring-1 ring-border-subtle">
                <Image
                  src="/demo/products/photo-09.jpg"
                  alt="RISITEX vertically-integrated manufacturing facility, Karnataka"
                  fill
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  className="object-cover"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"
                />
                <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-3 rounded-md bg-surface-background/85 px-4 py-3 backdrop-blur-modal">
                  <div>
                    <p className="font-mono text-heading-sm text-text-primary numerics-tabular">
                      4 lines
                    </p>
                    <p className="text-caption text-text-muted">Sewing</p>
                  </div>
                  <div>
                    <p className="font-mono text-heading-sm text-text-primary numerics-tabular">
                      120k/mo
                    </p>
                    <p className="text-caption text-text-muted">Pieces</p>
                  </div>
                  <div>
                    <p className="font-mono text-heading-sm text-text-primary numerics-tabular">
                      AQL 2.5
                    </p>
                    <p className="text-caption text-text-muted">QA bar</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* B2B PROCESS */}
      <section className="border-b border-border-subtle py-16 md:py-20 bg-surface-sunken">
        <Container>
          <div className="text-center">
            <p className="text-micro text-text-muted">How It Works</p>
            <h2 className="mt-2 text-heading-xl text-text-primary">
              Start Sourcing in Three Steps
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              { step: "01", title: "Apply", desc: "Submit your business details, GSTIN, and trade references. We verify within 24 hours." },
              { step: "02", title: "Get Approved", desc: "Once verified, you're assigned a pricing tier based on your business volume and profile." },
              { step: "03", title: "Order & Grow", desc: "Browse wholesale catalogue, place orders at tier pricing, and scale your business." },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <span className="text-mono-md text-text-muted">{s.step}</span>
                <h3 className="mt-3 text-heading-md text-text-primary">{s.title}</h3>
                <p className="mt-2 text-body-md text-text-secondary">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button asChild>
              <Link href="/auth/sign-in">Sign In</Link>
            </Button>
            <p className="mt-3 text-body-sm text-text-muted">
              New to RISITEX?{" "}
              <Link
                href="/auth/sign-up"
                className="text-text-primary underline-offset-4 hover:underline"
              >
                Apply for a wholesale account
              </Link>
            </p>
          </div>
        </Container>
      </section>

      {/* TESTIMONIALS */}
      <section className="border-b border-border-subtle py-16 md:py-20">
        <Container>
          <div className="text-center">
            <h2 className="text-heading-xl text-text-primary">
              Trusted by Businesses Nationwide
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { quote: "RISITEX has been our primary supplier for two years. Consistent quality, on-time delivery.", author: "Rajesh K.", role: "Retail Chain Owner, Chennai" },
              { quote: "The tier pricing structure makes it easy to scale. We started with Silver and moved to Gold within months.", author: "Priya S.", role: "Distributor, Mumbai" },
              { quote: "Their GST invoicing and logistics network save us hours of administrative work every week.", author: "Amit V.", role: "Procurement Manager, Delhi" },
            ].map((t) => (
              <div key={t.author} className="rounded-lg border border-border-subtle p-6">
                <p className="text-body-md text-text-secondary italic">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-4 border-t border-border-subtle pt-4">
                  <p className="text-body-sm font-medium text-text-primary">{t.author}</p>
                  <p className="text-caption text-text-muted">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="border-b border-border-subtle py-16 md:py-20 bg-surface-sunken">
        <Container>
          <div className="text-center">
            <h2 className="text-heading-xl text-text-primary">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="mt-10 mx-auto max-w-3xl space-y-4">
            {[
              { q: "What is the minimum order quantity?", a: "MOQ starts at 240 pieces per SKU. Selected products may have lower MOQs for trial orders." },
              { q: "How do I become a dealer or distributor?", a: "Apply through our wholesale program. Dealers and distributors receive exclusive pricing, priority dispatch, and dedicated support." },
              { q: "What payment terms are available?", a: "We offer advance payment, COD for approved customers, and credit terms for established dealers with good payment history." },
              { q: "Do you ship outside India?", a: "Yes, we export to select international markets. Contact us for international shipping rates and MOQs." },
              { q: "How long does delivery take?", a: "Standard manufacturing lead time is 10–35 days depending on the product and order volume. In-stock items ship within 48 hours." },
            ].map((faq) => (
              <details key={faq.q} className="group rounded-lg border border-border-subtle bg-surface-background">
                <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-body-md font-medium text-text-primary">
                  {faq.q}
                  <span aria-hidden className="ml-2 transition-transform group-open:rotate-180">&darr;</span>
                </summary>
                <div className="px-6 pb-4 text-body-md text-text-secondary">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-20">
        <Container width="narrow">
          <div className="text-center">
            <h2 className="text-heading-xl text-text-primary">
              Ready to Start Sourcing?
            </h2>
            <p className="mt-3 text-body-lg text-text-secondary">
              Create your wholesale account today and access factory-direct pricing.
            </p>
            <div className="mt-8 inline-flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/auth/sign-in">Sign In</Link>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/contact">Talk to Sales</Link>
              </Button>
            </div>
            <p className="mt-4 text-body-sm text-text-muted">
              Don&rsquo;t have an account?{" "}
              <Link
                href="/auth/sign-up"
                className="text-text-primary underline-offset-4 hover:underline"
              >
                Register your business
              </Link>
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
