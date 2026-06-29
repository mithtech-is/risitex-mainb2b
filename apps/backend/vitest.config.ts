import { defineConfig } from "vitest/config"
import path from "path"

/**
 * Vitest configuration — Phase G.
 *
 * Scope is deliberately narrow: pure unit tests of helpers,
 * validators, and middleware. We do NOT spin up the Medusa container
 * here (that's an integration concern and would require a Postgres
 * test DB; defer to a separate `test:integration` target).
 *
 * The `include` pattern below matches `**\/__tests__/*.test.ts` so
 * test files live next to the code they exercise.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    globals: false,
    pool: "forks",
    isolate: true,
    testTimeout: 5000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
})
