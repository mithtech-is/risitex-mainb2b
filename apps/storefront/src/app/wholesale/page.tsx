import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@risitex/ui/components";
import { Container } from "@/components/site/container";
import { SignedOut, SignedIn } from "@/components/auth/signed-out";

export const metadata: Metadata = {
  title: "Wholesale Program",
  description: "RISITEX wholesale program — tier pricing, volume discounts, MOQ, and GST-compliant invoicing for dealers and distributors.",
};

const TIERS = [
  { name: "Bronze", moq: "240 pcs", discount: "Standard pricing", leadTime: "25–35 days", support: "Email support" },
  { name: "Silver", moq: "480 pcs", discount: "5% discount", leadTime: "20–30 days", support: "Priority email + phone" },
  { name: "Gold", moq: "1,200 pcs", discount: "10% discount", leadTime: "15–25 days", support: "Dedicated account manager" },
  { name: "Platinum", moq: "3,600 pcs", discount: "15%+ discount", leadTime: "10–20 days", support: "24/7 dedicated support" },
];

const STEPS = [
  { n: "01", title: "Submit Application", body: "Fill in your business details, GSTIN, and trade references. We verify within 24–48 hours." },
  { n: "02", title: "Verification & Approval", body: "Our team reviews your application, verifies your documents, and assigns a pricing tier." },
  { n: "03", title: "Start Ordering", body: "Browse wholesale catalogue at your tier pricing. Place orders, track shipments, and grow your business." },
];

export default function WholesaleProgramPage() {
  return (
    <>
      <section className="border-b border-border-subtle bg-gradient-to-br from-surface-background via-surface-sunken to-surface-background">
        <Container>
          <div className="grid grid-cols-1 gap-12 py-20 md:py-28 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <p className="text-micro text-text-muted">Wholesale Program</p>
              <h1 className="mt-3 text-display-xl text-text-primary">
                Wholesale Pricing on Premium Textiles
              </h1>
              <p className="mt-6 max-w-prose text-body-lg text-text-secondary">
                Join the RISITEX wholesale program and access factory-direct pricing on our complete
                product range. Designed for dealers, distributors, retailers, and businesses.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <SignedOut>
                  <Button asChild size="lg">
                    <Link href="/auth/sign-in">Sign In</Link>
                  </Button>
                </SignedOut>
                <SignedIn>
                  <Button asChild size="lg">
                    <Link href="/b2b/dashboard">Open dashboard</Link>
                  </Button>
                </SignedIn>
                <Button variant="secondary" size="lg" asChild>
                  <Link href="/products">Browse Catalogue</Link>
                </Button>
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
            </div>
            <div className="lg:col-span-5">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl ring-1 ring-border-subtle shadow-rest">
                <Image
                  src="/demo/products/photo-04.jpg"
                  alt="RISITEX wholesale program — premium textiles for B2B buyers"
                  fill
                  priority
                  sizes="(min-width: 1024px) 42vw, 100vw"
                  className="object-cover"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"
                />
                <dl className="absolute bottom-4 left-4 right-4 grid grid-cols-2 gap-3 rounded-md bg-surface-background/85 px-4 py-3 backdrop-blur-modal">
                  <div>
                    <dt className="text-micro text-text-muted">MOQ</dt>
                    <dd className="mt-0.5 text-body-md font-medium text-text-primary numerics-tabular">
                      from 240 pcs
                    </dd>
                  </div>
                  <div>
                    <dt className="text-micro text-text-muted">Tiers</dt>
                    <dd className="mt-0.5 text-body-md font-medium text-text-primary">
                      4 levels
                    </dd>
                  </div>
                  <div>
                    <dt className="text-micro text-text-muted">Lead Time</dt>
                    <dd className="mt-0.5 text-body-md font-medium text-text-primary">
                      10–35 days
                    </dd>
                  </div>
                  <div>
                    <dt className="text-micro text-text-muted">GST</dt>
                    <dd className="mt-0.5 text-body-md font-medium text-text-primary">
                      Automatic
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-border-subtle py-20">
        <Container>
          <p className="text-micro text-text-muted">How it works</p>
          <h2 className="mt-2 text-heading-xl text-text-primary">Three Steps to Start</h2>
          <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n}>
                <span className="text-mono-md text-text-muted">{s.n}</span>
                <h3 className="mt-2 text-heading-md text-text-primary">{s.title}</h3>
                <p className="mt-3 text-body-md text-text-secondary">{s.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-border-subtle bg-surface-sunken py-20">
        <Container>
          <p className="text-micro text-text-muted">Pricing Tiers</p>
          <h2 className="mt-2 text-heading-xl text-text-primary">Choose Your Tier</h2>
          <p className="mt-3 max-w-prose text-body-lg text-text-secondary">
            As your order volume grows, you automatically progress through tiers with increasing
            discounts and benefits.
          </p>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left py-3 px-4 text-body-sm font-medium text-text-muted">Tier</th>
                  <th className="text-left py-3 px-4 text-body-sm font-medium text-text-muted">MOQ</th>
                  <th className="text-left py-3 px-4 text-body-sm font-medium text-text-muted">Discount</th>
                  <th className="text-left py-3 px-4 text-body-sm font-medium text-text-muted">Lead Time</th>
                  <th className="text-left py-3 px-4 text-body-sm font-medium text-text-muted">Support</th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map((tier) => (
                  <tr key={tier.name} className="border-b border-border-subtle">
                    <td className="py-4 px-4 text-body-md font-medium text-text-primary">{tier.name}</td>
                    <td className="py-4 px-4 text-body-md text-text-secondary">{tier.moq}</td>
                    <td className="py-4 px-4 text-body-md text-text-secondary">{tier.discount}</td>
                    <td className="py-4 px-4 text-body-md text-text-secondary">{tier.leadTime}</td>
                    <td className="py-4 px-4 text-body-md text-text-secondary">{tier.support}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      <section className="border-b border-border-subtle py-20">
        <Container>
          <p className="text-micro text-text-muted">Benefits</p>
          <h2 className="mt-2 text-heading-xl text-text-primary">Why Join the Program?</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Factory-Direct Pricing", desc: "Eliminate middlemen. Get the best prices directly from the manufacturer." },
              { title: "Volume Discounts", desc: "Automatic tier upgrades as your order volume grows. More you order, more you save." },
              { title: "GST-Compliant", desc: "Automatic GST invoicing with CGST/SGST/IGST breakdown for seamless tax compliance." },
              { title: "Master Cartons", desc: "Standardised carton quantities for predictable inventory and easy logistics." },
              { title: "Quality Guarantee", desc: "Every batch quality-tested before dispatch. Consistent product across all orders." },
              { title: "Dedicated Support", desc: "Personal account manager for Gold and Platinum tiers. Priority support for all." },
            ].map((b) => (
              <div key={b.title} className="rounded-lg border border-border-subtle p-6">
                <h3 className="text-heading-sm text-text-primary">{b.title}</h3>
                <p className="mt-2 text-body-md text-text-secondary">{b.desc}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <SignedOut>
        <section className="py-20 bg-surface-sunken">
          <Container width="narrow" className="text-center">
            <h2 className="text-heading-xl text-text-primary">Ready to Get Started?</h2>
            <p className="mt-3 text-body-lg text-text-secondary">
              Apply today and start sourcing premium textiles at wholesale pricing.
            </p>
            <div className="mt-8 inline-flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/auth/sign-in">Sign In</Link>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/products">Browse Products</Link>
              </Button>
            </div>
            <p className="mt-4 text-body-sm text-text-muted">
              New here?{" "}
              <Link
                href="/auth/sign-up"
                className="text-text-primary underline-offset-4 hover:underline"
              >
                Register your business
              </Link>
            </p>
          </Container>
        </section>
      </SignedOut>
    </>
  );
}
