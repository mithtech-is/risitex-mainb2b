import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

import { Topnav } from "@/components/site/topnav";
import { Footer } from "@/components/site/footer";
import { ThemeProvider } from "@/components/site/theme-provider";
import { WhatsAppButton } from "@/components/site/whatsapp-button";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Primary UI face — Inter Tight (tighter, more editorial than Inter).
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
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
      className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable} ${sourceSerif.variable}`}
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
