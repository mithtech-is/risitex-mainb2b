import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,

  // Zero-downtime deploys: build into an inactive slot (NEXT_DIST_DIR=.next-a
  // / .next-b) while the live slot keeps serving, then flip + restart. Both
  // `next build` and `next start` read the same env var, so the output dir is
  // always consistent. Unset (local dev / CI) → the default ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Production builds should not fail on lint style rules (prefer-const,
  // unused vars, etc.) — linting is a dev/CI concern, not a build gate.
  // Type-checking still runs and blocks the build on real type errors.
  eslint: { ignoreDuringBuilds: true },

  // Allow @risitex/ui to be transpiled from source (workspace TS) at build time.
  transpilePackages: ["@risitex/ui", "@risitex/shared"],

  experimental: {
    optimizePackageImports: ["@risitex/ui"],
  },

  // Long-form copy on PDPs will hydrate large images — let next/image accept
  // common CDN origins. Tightened per-environment via env when known.
  images: {
    remotePatterns: [
      // RISITEX backend (lambyrisiback156.lamongie.in) serves admin-uploaded
      // product images from /static — allowlist the domain so next/image
      // renders them on the storefront.
      { protocol: "https", hostname: "**.lamongie.in" },
      { protocol: "https", hostname: "**.risitex.com" },
      { protocol: "https", hostname: "**.imgix.net" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      // Medusa file providers: local dev (backend static), S3/MinIO,
      // Cloudinary, and Medusa Cloud. Product thumbnails resolve from
      // whichever the backend uses — add your production CDN host here.
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "**.medusajs.app" },
    ],
  },

  // Security headers — production-grade defaults. Loose in dev (no HSTS).
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
      { key: "X-Frame-Options", value: "DENY" },
    ];
    if (isProd) {
      common.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      });
    }
    return [{ source: "/(.*)", headers: common }];
  },

  async redirects() {
    return [
      { source: "/collections", destination: "/products", permanent: true },
      { source: "/blogs", destination: "/products", permanent: true },
      { source: "/industries", destination: "/about", permanent: true },
      { source: "/manufacturing", destination: "/about", permanent: true },
      { source: "/quality", destination: "/about", permanent: true },
      { source: "/dealer", destination: "/auth/sign-up", permanent: true },
      { source: "/dealer/:path*", destination: "/auth/sign-up", permanent: true },
      { source: "/distributor", destination: "/auth/sign-up", permanent: true },
      { source: "/distributor/:path*", destination: "/b2b/dashboard", permanent: true },
      // Old "manual approval" application form → consolidated into the
      // new OTP-driven Submit Application flow at /auth/sign-up.
      { source: "/wholesale/apply", destination: "/auth/sign-up", permanent: false },
      { source: "/wholesale/apply/:path*", destination: "/auth/sign-up", permanent: false },
      { source: "/shop", destination: "/products", permanent: true },
      { source: "/cart", destination: "/b2b/cart", permanent: true },
      { source: "/account", destination: "/b2b/dashboard", permanent: true },
      { source: "/account/:path*", destination: "/b2b/dashboard", permanent: true },
      { source: "/p/:slug", destination: "/wholesale/p/:slug", permanent: true },
      // Catch stale "/products/<slug>" links that landed during the catalogue
      // refactor. The PLP at /products is OK; only single-product paths get
      // rewritten to the working wholesale PDP.
      { source: "/products/:slug", destination: "/wholesale/p/:slug", permanent: false },
      { source: "/affiliate", destination: "/b2b/dashboard", permanent: true },
      { source: "/affiliate/:path*", destination: "/b2b/dashboard", permanent: true },
      { source: "/b2b/referrals", destination: "/b2b/dashboard", permanent: true },
    ];
  },
};

export default config;
