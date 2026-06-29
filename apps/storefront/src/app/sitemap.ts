import type { MetadataRoute } from "next";

const BASE = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/about",
    "/products",
    "/wholesale/catalogue",
    "/contact",
    "/b2b/dashboard",
    "/b2b/inventory",
    "/b2b/orders",
    "/b2b/purchase-orders",
    "/b2b/shipments",
    "/b2b/wallet",
    "/privacy",
    "/terms",
    "/shipping-policy",
    "/refund-policy",
  ].map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: path === "" || path.startsWith("/products") ? "daily" : "monthly",
    priority: path === "" ? 1 : path.startsWith("/products") ? 0.8 : 0.5,
  }));

  return [...staticRoutes];
}
