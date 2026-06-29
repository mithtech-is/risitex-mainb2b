// Static-analysis test gate for the 5 routes migrated to the response
// envelope shape in Phase 5 of the architecture refactor. Asserts each
// route handler:
//
//   1. Imports `respondOk` and `respondErr` from src/utils/envelope.
//   2. Contains at least one `respondOk(` call AND at least one
//      `respondErr(` call.
//   3. Does NOT regress to legacy `res.json({ ok: true|false, ... })`
//      shapes that flatten data to the top level.
//
// Pure-node, framework-free — same convention as the rest of this
// directory's .test.mjs files. Reads route source files from disk and
// pattern-matches; no Medusa boot, no fetch, no zod runtime.
//
// What this catches:
//   - A route gets reverted to legacy `res.json({ ok: true, foo, bar })`
//     during a follow-up edit.
//   - A new error path forgets to call respondErr and hand-rolls the
//     body shape.
//   - The respondOk/respondErr import gets dropped after a refactor.
//
// What this does NOT catch:
//   - Schema-shape regressions in @polemarch/api-contracts (those need
//     a runtime zod test against the actual schemas — deferred until
//     api-contracts has a build step or tsx-based test runner).
//   - Routes that emit the right shape but with wrong field names
//     inside `data` (only a real route call against a contract schema
//     catches that).
//
// Run:  node apps/medusa-backend/tests/route-envelope-adoption.test.mjs

import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "../../..")

// Routes migrated to the envelope in Phase 5. Add new entries here as
// follow-up phases migrate more routes.
const MIGRATED_ROUTES = [
  "apps/medusa-backend/src/api/store/kyc/status/route.ts",
  "apps/medusa-backend/src/api/store/kyc/pan/verify/route.ts",
  "apps/medusa-backend/src/api/store/auth/phone-otp/verify/route.ts",
  "apps/medusa-backend/src/api/store/me/email-otp/send/route.ts",
  "apps/medusa-backend/src/api/store/me/email-otp/verify/route.ts",
]

// ── Test runner ────────────────────────────────────────────────

let passCount = 0
let failCount = 0

function describe(label, fn) {
  console.log(`\n${label}:`)
  fn()
}

function it(label, fn) {
  try {
    fn()
    console.log(`  ✅ ${label}`)
    passCount++
  } catch (err) {
    console.log(`  ❌ ${label}`)
    console.log(`     ${err.message}`)
    failCount++
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

// ── Tests ──────────────────────────────────────────────────────

for (const route of MIGRATED_ROUTES) {
  const path = resolve(REPO_ROOT, route)
  const src = readFileSync(path, "utf8")

  describe(route, () => {
    it("imports respondOk + respondErr from utils/envelope", () => {
      // Two acceptable forms:
      //   import { respondOk, respondErr } from "...utils/envelope"
      //   import { respondErr, respondOk } from "...utils/envelope"
      const hasImport =
        /import\s*\{[^}]*\brespondOk\b[^}]*\brespondErr\b[^}]*\}\s*from\s*["'][^"']*utils\/envelope["']/.test(src) ||
        /import\s*\{[^}]*\brespondErr\b[^}]*\brespondOk\b[^}]*\}\s*from\s*["'][^"']*utils\/envelope["']/.test(src)
      assert(
        hasImport,
        `expected an import of respondOk + respondErr from utils/envelope`,
      )
    })

    it("calls respondOk at least once", () => {
      const matches = src.match(/\brespondOk\s*\(/g) ?? []
      assert(
        matches.length >= 1,
        `expected >= 1 respondOk(...) call, found ${matches.length}`,
      )
    })

    it("calls respondErr at least once", () => {
      const matches = src.match(/\brespondErr\s*\(/g) ?? []
      assert(
        matches.length >= 1,
        `expected >= 1 respondErr(...) call, found ${matches.length}`,
      )
    })

    it("does not emit legacy res.json({ ok: ... }) envelopes", () => {
      // Catches both:
      //   res.json({ ok: true, ... })
      //   res.status(N).json({ ok: false, ... })
      // Whitespace-tolerant; allows newlines + indentation between
      // "{" and "ok:".
      const legacy = /\bres\s*(?:\.status\s*\([^)]*\))?\s*\.json\s*\(\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*ok\s*:/g
      const matches = src.match(legacy) ?? []
      assert(
        matches.length === 0,
        `expected zero legacy res.json({ ok: ... }) calls, found ${matches.length}: ${matches.slice(0, 2).join(" | ")}`,
      )
    })
  })
}

// Cross-route invariant: the helpers themselves must exist where the
// routes import them from.
describe("apps/medusa-backend/src/utils/envelope.ts", () => {
  const helperPath = resolve(
    REPO_ROOT,
    "apps/medusa-backend/src/utils/envelope.ts",
  )
  const src = readFileSync(helperPath, "utf8")

  it("exports respondOk", () => {
    assert(
      /\bexport\s+function\s+respondOk\b/.test(src),
      "respondOk export missing",
    )
  })

  it("exports respondErr", () => {
    assert(
      /\bexport\s+function\s+respondErr\b/.test(src),
      "respondErr export missing",
    )
  })

  it("documents the webhook exemption (idempotent-200 pattern)", () => {
    // Phase 5 deliberately exempts /webhooks/* from the envelope. The
    // helper file should call this out so a future contributor doesn't
    // accidentally wrap a webhook handler.
    assert(
      /webhook/i.test(src),
      "envelope helper should document the webhook exemption in its header comment",
    )
  })
})

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${passCount} passed, ${failCount} failed`)
if (failCount > 0) process.exit(1)
