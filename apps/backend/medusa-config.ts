// Must be the very first import — Sentry needs to patch http / express
// / pg before any instrumented module is loaded. Safe to ship with
// SENTRY_DSN empty (SDK no-ops).
import './src/instrument'

import { loadEnv, defineConfig } from '@medusajs/framework/utils'
import { Modules } from '@medusajs/utils'
import path from 'path'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const analyticsModule = process.env.POSTHOG_EVENTS_API_KEY
    ? {
        analytics: {
            resolve: "@medusajs/medusa/analytics",
            options: {
                providers: [
                    {
                        resolve: "@medusajs/analytics-posthog",
                        id: "posthog",
                        options: {
                            posthogEventsKey: process.env.POSTHOG_EVENTS_API_KEY,
                            posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
                        },
                    },
                ],
            },
        },
    }
    : {}

export default defineConfig({
    projectConfig: {
        databaseUrl: process.env.DATABASE_URL,
        // Redis URL wires the framework's default session store +
        // rate-limiter + lock backend to Redis. Without this, sessions
        // are kept in Express's MemoryStore — every container restart
        // (= every deploy) logs every admin user out. Phase 13.A flip.
        //
        // The event bus + cache + workflow-engine + locking modules
        // below ALSO need the URL — kept separate so a single env-var
        // flip is the toggle.
        redisUrl: process.env.REDIS_URL,
        // Session idle-timeout.
        //
        // `ttl` is Medusa's per-session max-age; `rolling: true`
        // resets the timer on every authenticated request so only
        // IDLE sessions expire. 2h is a reasonable balance for ops:
        // an admin walking away from their laptop during a lunch
        // break is logged out, but an admin actively using the
        // admin UI never gets kicked mid-task. Customer-facing
        // storefront auth uses JWT bearer tokens (not this cookie
        // session) so this doesn't affect end-user sign-in UX.
        sessionOptions: {
            ttl: 2 * 60 * 60 * 1000,
            rolling: true,
        },
        http: {
            storeCors: process.env.STORE_CORS || "http://localhost:3001,http://localhost:8000,http://127.0.0.1:3001,http://127.0.0.1:8000",
            adminCors: process.env.ADMIN_CORS || "http://localhost:3001,http://localhost:7001,http://127.0.0.1:3001,http://127.0.0.1:7001",
            authCors: process.env.AUTH_CORS || "http://localhost:3001,http://localhost:7001,http://127.0.0.1:3001,http://127.0.0.1:7001",
            // NOTE on cross-subdomain SSO: Medusa 2.13's http config
            // does not expose `cookieDomain`. To share the session
            // across polemarch.in / prora.polemarch.in /
            // issuers.polemarch.in, we widen the Set-Cookie domain
            // at the Caddy hop (see Caddyfile — a single `header`
            // directive rewrites Domain= on the proxied response).
            // Keeping the Medusa config minimal here.
            jwtSecret: (() => {
                const s = process.env.JWT_SECRET;
                if (!s || s === "supersecret") throw new Error("JWT_SECRET env var must be set to a secure value");
                return s;
            })(),
            cookieSecret: (() => {
                const s = process.env.COOKIE_SECRET;
                if (!s || s === "supersecret") throw new Error("COOKIE_SECRET env var must be set to a secure value");
                return s;
            })(),
        }
    },
    admin: {
        // `medusa build` compiles admin to `<tsconfig.outDir>/public/admin`
        // (dist/public/admin here). `medusa start` reads from `./public/
        // admin` relative to process.cwd(). The backend/Dockerfile copies
        // the bundle from builder's dist/public/admin → runtime's
        // ./public/admin to bridge the mismatch.
        disable: false,
    },
    plugins: [
        // ERPNext (Frappe) sync. Lives as a workspace plugin in
        // `packages/medusa-plugin-erpnext` so it can be lifted into a
        // separate repo / shared across deployments cleanly. Bundles
        // the module + admin API routes + admin UI route + subscriber.
        // ERPNEXT_URL + ERPNEXT_WEBHOOK_SECRET env vars must be set
        // for forwards to attempt delivery; without them events are
        // recorded as `skipped` in `erpnext_sync_event` for replay.
        {
            resolve: "@polemarch/medusa-plugin-erpnext",
            options: {},
        },
    ],
    modules: {
        // ── Redis-backed framework modules (Phase 13.A/B) ────────────
        //
        // Default Medusa V2 wiring uses in-memory implementations for
        // event bus, cache, workflow engine, and locking. The startup
        // banner explicitly warns about it:
        //   "Local Event Bus installed. This is not recommended for
        //    production."
        //   "Locking module: Using 'in-memory' as default."
        //
        // Each in-memory backend has a real prod problem:
        //   - Event Bus: subscribers run in-process; if a subscriber
        //     throws, the producer fiber doesn't know. Cross-instance
        //     fan-out is impossible.
        //   - Cache: per-process; one cold container after a deploy
        //     sees a stampede of un-cached requests.
        //   - Workflow Engine: in-flight workflow steps die on
        //     container restart with no resume path.
        //   - Locking: single-process locks, so two containers
        //     racing on the same workflow can both win.
        //
        // Redis is already running in compose (port 6379, persistent
        // volume), so flipping each module to its Redis variant is a
        // single env-var → resolve change. `redisUrl` falls through
        // from projectConfig.
        [Modules.EVENT_BUS]: {
            resolve: "@medusajs/event-bus-redis",
            options: { redisUrl: process.env.REDIS_URL },
        },
        [Modules.CACHE]: {
            resolve: "@medusajs/cache-redis",
            options: { redisUrl: process.env.REDIS_URL },
        },
        [Modules.WORKFLOW_ENGINE]: {
            resolve: "@medusajs/workflow-engine-redis",
            // NB: despite the deprecation warning printed at boot
            // claiming `url` is deprecated for `redisUrl`,
            // workflow-engine-redis@2.14.x actually destructures
            // `options.redis.url` at load time. Using `redisUrl` here
            // crashes the module at startup
            // ("Cannot destructure property 'url' of (intermediate
            // value) as it is undefined"). Keep the nested shape.
            options: { redis: { url: process.env.REDIS_URL } },
        },
        [Modules.LOCKING]: {
            // Locking takes a `providers` array nested under `options`
            // — `@medusajs/locking-redis` is a `ModuleProviderExports`,
            // so it plugs into the framework's Locking service rather
            // than replacing it wholesale.
            options: {
                providers: [
                    {
                        resolve: "@medusajs/locking-redis",
                        id: "redis",
                        options: { redisUrl: process.env.REDIS_URL },
                    },
                ],
            },
        },
        [Modules.FILE]: {
            resolve: "@medusajs/file",
            options: {
                // Custom configurable provider — reads its active backend
                // (local or any S3-compatible store: R2 / AWS / MinIO /
                // Wasabi / DO) from the file_storage_setting DB row at
                // runtime, editable from backrow23 → File storage. Falls
                // back to env S3_* then local. KYC/proof uploads bypass
                // this entirely (private local volume).
                providers: [
                    {
                        resolve: "./src/modules/file_storage_provider",
                        id: "configurable",
                        options: {},
                    },
                ],
            },
        },
        // Settings store for the configurable file provider above.
        file_storage: {
            resolve: "./src/modules/file_storage",
        },
        polemarch: {
            resolve: "./src/modules/polemarch",
        },
        // (ERPNext module moved to packages/medusa-plugin-erpnext —
        // registered above in plugins[]. Will be renamed to
        // @risitex/medusa-plugin-erpnext in Phase 8.)
        cashfree_wallet: {
            resolve: "./src/modules/cashfree_wallet",
        },
        password_history: {
            resolve: "./src/modules/password_history",
        },
        // ── Phase 4: B2B onboarding + tier-driven pricing ────────
        company: {
            resolve: "./src/modules/company",
        },
        customer_tier: {
            resolve: "./src/modules/customer_tier",
        },
        // ── B2B Sales domain: pricing & rules engine ─────────────
        // Ported + adapted from Holisto medusa-plugin-b2b (`b2b_rules`).
        // Tier/volume pricing, MOQ/quantity rules, server-side product
        // visibility, and the dynamic-rules engine. Drives off
        // customer_tier (Holisto's customer_group_id → customer_tier_id).
        b2b_pricing: {
            resolve: "./src/modules/b2b_pricing",
        },
        // ── Phase 7: sales-rep attribution + commission ──────────
        sales_performance: {
            resolve: "./src/modules/sales_performance",
        },
        // ── Phase 9-10: logistics, backorders, wholesale flows ──
        logistics: {
            resolve: "./src/modules/logistics",
        },
        backorder: {
            resolve: "./src/modules/backorder",
        },
        master_carton: {
            resolve: "./src/modules/master_carton",
        },
        matrix_order: {
            resolve: "./src/modules/matrix_order",
        },
        purchase_order: {
            resolve: "./src/modules/purchase_order",
        },
        credit_terms: {
            resolve: "./src/modules/credit_terms",
        },
        saved_cart: {
            resolve: "./src/modules/saved_cart",
        },
        marketing: {
            resolve: "./src/modules/campaign",
        },
        discount_code: {
            resolve: "./src/modules/discount_code",
        },
        // ── Ported from the legacy textile backend (monorepo
        // consolidation, 2026-06-19). v2 had no equivalents:
        //   product_questions → storefront /store/product-questions Q&A
        //   rbac              → custom roles / permissions / grants
        //   warehouse         → per-stock-location warehouse profiles
        product_questions: {
            resolve: "./src/modules/product-questions",
        },
        rbac: {
            resolve: "./src/modules/rbac",
        },
        warehouse: {
            resolve: "./src/modules/warehouse",
        },
        // Renamed from `polemarch_email` to broaden scope: this module
        // now also handles MSG91 SMS, Polygin WhatsApp, and the phone
        // OTP issuance + verification flow. The constant
        // `POLEMARCH_EMAIL_MODULE` exported from the module is kept
        // pointing at this same key so the existing notification
        // provider + subscriber DI continues to resolve. Existing
        // imports were bulk-renamed to `polemarch_communication`.
        polemarch_communication: {
            resolve: "./src/modules/polemarch_communication",
        },
        // polemarch_content module is DEFERRED for RISITEX MVP — see
        // docs/migration-plan.md §1.1. It remains in the repo so we can
        // re-enable post-MVP without re-importing.
        // polemarch_content: { resolve: "./src/modules/polemarch_content" },
        [Modules.NOTIFICATION]: {
            resolve: "@medusajs/medusa/notification",
            options: {
                providers: [
                    {
                        resolve: "@medusajs/medusa/notification-local",
                        id: "local",
                        options: {
                            name: "Local Notification Provider",
                            channels: ["feed"],
                        },
                    },
                    {
                        // The notification provider stayed in its own
                        // folder (named after its identifier "polemarch-
                        // smtp") and DI-resolves the communication
                        // module via the back-compat POLEMARCH_EMAIL_
                        // MODULE constant — the constant now points at
                        // `polemarch_communication`, so DI just works.
                        resolve: "./src/modules/polemarch_email_provider",
                        id: "polemarch-smtp",
                        options: {
                            channels: ["email"],
                        },
                    },
                ],
            },
        },
        [Modules.PAYMENT]: {
            resolve: "@medusajs/medusa/payment",
            options: {
                providers: [
                    {
                        resolve: "./src/modules/cashfree_wallet_provider",
                        id: "cashfree-wallet",
                        options: {},
                    },
                    {
                        // Razorpay rail (Phase 11.N). Reads RAZORPAY_KEY_ID /
                        // RAZORPAY_KEY_SECRET from env at construct time. With
                        // both empty the provider runs in pass-through dev
                        // mode (synthetic order ids, auto-authorize) so /shop
                        // → /checkout → order-placed flows can be smoke-tested
                        // without a Razorpay test account.
                        resolve: "./src/modules/razorpay_provider",
                        id: "razorpay",
                        options: {},
                    },
                ],
            },
        },
        // ── FR-4.02: Indian GST tax provider ─────────────────────
        // Per-line CGST/SGST (intra-state) vs IGST (inter-state) at the
        // textile bracket (5% ≤ ₹1000, 12% > ₹1000). A tax region for
        // India must point its provider_id at `tp_risitex-gst_<id>`
        // (seed: src/scripts/seed-gst-tax-region.ts).
        [Modules.TAX]: {
            resolve: "@medusajs/medusa/tax",
            options: {
                providers: [
                    {
                        resolve: "./src/modules/gst_tax",
                        id: "risitex-gst",
                        options: {},
                    },
                ],
            },
        },
        ...analyticsModule,
    },
})
