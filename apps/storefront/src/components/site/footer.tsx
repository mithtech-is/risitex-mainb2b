import Link from "next/link";
import Image from "next/image";
import { Container } from "./container";
import { COMPANY } from "@/lib/company";

const FOOTER_COLUMNS = [
  {
    title: "Catalogue",
    links: [
      { href: "/wholesale/catalogue", label: "Catalogue" },
      { href: "/b2b/inventory", label: "Inventory" },
    ],
  },
  {
    title: "B2B Workspace",
    links: [
      { href: "/b2b/dashboard", label: "Dashboard" },
      { href: "/b2b/orders", label: "Orders" },
      { href: "/b2b/shipments", label: "Shipments" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/b2b/profile", label: "Profile Settings" },
      { href: "/contact", label: "Contact Us" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Business Enquiry" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" },
    ],
  },
];

const TRUST_STRIP = [
  { label: "GST Registered", note: COMPANY.gstin },
  { label: "Made in India", note: "Karnataka, India" },
  { label: "MOQ", note: "From 240 pieces" },
  { label: "Wholesale Pricing", note: "Tier-based discounts" },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border-subtle bg-surface-background">
      <Container>
        <div className="grid grid-cols-2 gap-6 border-b border-border-subtle py-8 md:grid-cols-4">
          {TRUST_STRIP.map((item) => (
            <div key={item.label} className="flex flex-col gap-1">
              <span className="text-micro text-text-muted">{item.label}</span>
              <span className="text-body-md text-text-primary">{item.note}</span>
            </div>
          ))}
        </div>
      </Container>

      <Container>
        <div className="grid grid-cols-2 gap-8 py-12 md:grid-cols-4 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-1">
            {/* The real RISITEX mark. Two variants toggled by the same
                .rx-logo-black / .rx-logo-light CSS in globals.css the navbar
                uses, so it flips with the theme: black on the light footer,
                light on the dark footer. */}
            <Link href="/" aria-label="RISITEX home" className="relative block h-[76px] w-[76px]">
              <Image
                src="/brand/risitex-logo-black.png"
                alt="RISITEX"
                fill
                sizes="76px"
                className="rx-logo-black object-contain object-left"
              />
              <Image
                src="/brand/risitex-logo-light.png"
                alt=""
                fill
                sizes="76px"
                className="rx-logo-light object-contain object-left"
              />
            </Link>
            <p className="mt-4 max-w-xs text-body-sm text-text-muted">
              Premium textile manufacturing and wholesale. Serving dealers,
              distributors, and businesses across India and worldwide.
            </p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-micro text-text-muted">{col.title}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={`${col.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-body-md text-text-secondary transition-colors duration-fast hover:text-text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>

      <Container>
        <div className="flex flex-col items-start justify-between gap-3 border-t border-border-subtle py-6 md:flex-row md:items-center">
          <p className="text-body-sm text-text-muted">
            &copy; {new Date().getFullYear()} {COMPANY.name}. All rights
            reserved.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm text-text-muted">
            <li>
              <Link
                href="/privacy"
                className="transition-colors duration-fast hover:text-text-primary"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="transition-colors duration-fast hover:text-text-primary"
              >
                Terms
              </Link>
            </li>
            <li>
              <Link
                href="/shipping-policy"
                className="transition-colors duration-fast hover:text-text-primary"
              >
                Shipping Policy
              </Link>
            </li>
            <li>
              <Link
                href="/refund-policy"
                className="transition-colors duration-fast hover:text-text-primary"
              >
                Refund Policy
              </Link>
            </li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}
