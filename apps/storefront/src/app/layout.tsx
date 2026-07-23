import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

import { Topnav } from "@/components/site/topnav";
import { Footer } from "@/components/site/footer";
import { ThemeProvider } from "@/components/site/theme-provider";
import { WhatsAppButton } from "@/components/site/whatsapp-button";

/**
 * The single typeface for the whole site — Space Grotesk.
 *
 * Chosen by the user after five "this looks boring" rounds: it is the face on
 * mith.tech, the site they hold up as the standard. Geometric and slightly odd
 * (it descends from Space Mono), it reads designed rather than default, which
 * Inter Tight — the previous pick — did not.
 *
 * It carries display, body and numerics alike: it holds up at a 100px+ hero and
 * stays legible at a 13px table label, and it has tabular figures, which is
 * what keeps invoice and order columns aligned (see the global
 * `font-variant-numeric` rule in @risitex/ui/styles.css).
 *
 * This used to load four families — Inter, Inter Tight, JetBrains Mono and
 * Source Serif 4 — while the CSS only ever resolved to one of them. Source
 * Serif in particular was downloaded on every page and referenced nowhere. If
 * you add a face here, make sure something actually renders in it.
 */
/*
 * ONE typeface for the whole site — Space Grotesk — including the redesigned
 * homepage (user's call, 2026-07-22). The homepage's display/accent contrast
 * is carried by WEIGHT (700 headlines against 300 accent words), not by a
 * second family; the Archivo + Instrument Serif pair the Vexo redesign
 * originally added has been removed to keep one identity and two fewer
 * font downloads.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "RISITEX — Premium Textile Manufacturing & Wholesale",
    template: "%s · RISITEX",
  },
  description:
    "India's premier B2B textile platform for wholesalers, retailers, distributors, and businesses. Premium fabrics and garments with wholesale pricing.",
  applicationName: "RISITEX",
  authors: [{ name: "Mithtech" }],
  keywords: [
    "textile",
    "wholesale",
    "B2B",
    "fabric",
    "apparel",
    "manufacturing",
    "India",
    "RISITEX",
    "dealer",
    "distributor",
  ],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F4F2" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1A1A" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={spaceGrotesk.variable}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-surface-background text-text-primary text-body-md antialiased">
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-tooltip focus-visible:rounded-md focus-visible:bg-surface-raised focus-visible:px-3 focus-visible:py-2 focus-visible:shadow-popover focus-visible:text-text-primary"
          >
            Skip to content
          </a>
          <Topnav />
          <main id="main" className="min-h-[calc(100vh-56px-220px)]">
            {children}
          </main>
          <Footer />
          <WhatsAppButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
