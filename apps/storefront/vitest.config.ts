import { defineConfig } from "vitest/config"
import path from "path"

/**
 * Vitest config for the storefront — Phase G.
 *
 * Unit tests of pure helpers + lib functions. We don't render React
 * components here (those would need jsdom + Testing Library; deferred
 * until we have a stable test harness).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    globals: false,
    pool: "forks",
    testTimeout: 5000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
})
