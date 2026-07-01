import { defineMiddlewares, validateAndTransformBody, validateAndTransformQuery } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
import { authenticate } from "@medusajs/framework/http"
import { z } from "zod"
import helmet from "helmet"
import { rateLimit } from "express-rate-limit"
import RedisStore from "rate-limit-redis"
import { getRedisClient } from "../lib/redis"
import { validateB2BCart } from "../lib/b2b-cart"
import { validateBody } from "../utils/validate-body"
import { readPrivateFile, privateBasename } from "../utils/private-storage"
import { CustomerUpdateSchema } from "../validators/customer-validator"
import { maskCustomerResponse } from "../utils/mask-middleware"
import { logger } from "../utils/logger"
import { validatePasswordPolicy } from "../utils/password-policy"
import { requireVerifiedCustomer } from "../utils/require-verified"
import {
    isLocked as isAccountLocked,
    recordFailure as recordLoginFailure,
    recordSuccess as recordLoginSuccess,
} from "../utils/account-lockout"
import { PASSWORD_HISTORY_MODULE } from "../modules/password_history"
import type PasswordHistoryService from "../modules/password_history/service"
// ── Validation DTOs for modules ported from the legacy textile backend
//    during monorepo consolidation (2026-06-19). ──
import {
    CreateRoleDto,
    UpdateRoleDto,
    ListRolesQueryDto,
    SetRolePermissionsDto,
    GrantRoleDto,
    ListUserRolesQueryDto,
    CheckPermissionDto,
} from "./validators/rbac"

// Hard-coded to avoid pulling cashfree_wallet's barrel into the
// middleware module — that barrel re-exports the service type and
// the chain inflates TS2589 on `npm run build`. Keep this string
// in sync with `CASHFREE_WALLET_MODULE` in modules/cashfree_wallet/index.ts.
const CASHFREE_WALLET_MODULE = "cashfree_wallet"

const upload = multer({ storage: multer.memoryStorage() })

// Bridge an Express RequestHandler (e.g. `multer().single(...)`) to the
// shape Medusa's middleware array expects. Functionally identical at
// runtime — Medusa wraps Express middleware verbatim — but Medusa's
// 2.x types narrow `Request` to `MedusaRequest`, so the cast is needed
// to keep TypeScript quiet around third-party Express middlewares.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const xMw = <T>(handler: T): any => handler;

/**
 * Build a `rate-limit-redis` Store wired to the project's ioredis
 * client when REDIS_URL is set, else return undefined so the limiter
 * falls back to express-rate-limit's MemoryStore. This keeps `pnpm
 * dev` workable on machines without Redis while making the prod
 * stack cluster-safe (Phase F.1).
 */
function makeRateLimitStore(prefix: string) {
    const client = getRedisClient()
    if (!client) return undefined
    return new RedisStore({
        // The Store type wants a `sendCommand` that returns Promise<any>.
        // ioredis exposes a `.call(name, ...args)` that fits.
        sendCommand: (...args: string[]) =>
            (client as unknown as {
                call: (cmd: string, ...rest: string[]) => Promise<unknown>
            }).call(args[0]!, ...args.slice(1)) as Promise<any>,
        prefix: `rl:${prefix}:`,
    })
}

const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 60 seconds
    max: 10, // Limit each IP to 10 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRateLimitStore("auth"),
    handler: (req, res) => {
        res.status(429).json({
            message: "Too many authentication attempts. Please try again in 60 seconds."
        });
    }
})

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 60 seconds
    max: 5, // Limit each IP to 5 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRateLimitStore("upload"),
    handler: (req, res) => {
        res.status(429).json({
            message: "Too many upload attempts. Please wait."
        });
    }
})

const storeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRateLimitStore("store"),
    handler: (req, res) => {
        res.status(429).json({
            message: "Too many requests. Please slow down."
        });
    }
})

/**
 * Admin route limiter — 120 req/min/IP.
 *
 * Sized for legitimate ops use (a single dashboard page can fan-out to
 * 5–15 admin calls; 120/min covers a power user clicking through several
 * tabs). Lower than the storefront limit's "burst friendliness" because
 * any 429 the user hits is acceptable — they refresh and continue.
 *
 * Auth on these routes is enforced separately via
 * `authenticate("user", ...)` middleware below; the rate-limit only
 * mitigates credential-spraying / scraping if a session token leaks.
 */
const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRateLimitStore("admin"),
    handler: (req, res) => {
        res.status(429).json({
            message: "Too many admin requests. Please slow down."
        });
    }
})

/**
 * Idle-timeout enforcement for admin (`user`) sessions.
 *
 * The Medusa session cookie has a fixed 10h TTL that resets only when
 * the cookie is re-sent (it's not a sliding window). To enforce an
 * *idle* timeout (logout after N minutes of inactivity regardless of
 * cookie TTL), we stamp `req.session.last_activity` on every
 * authenticated admin call and 401 if the gap exceeds the configured
 * window.
 *
 * 30-minute idle window is the SEBI / SEC-style baseline for back-
 * office portals dealing with PII + money. Tune via env var
 * `ADMIN_SESSION_IDLE_MS` for staging / dev (e.g. 8h for QA convenience).
 *
 * Hard-capped at 4h regardless of env value — protects against an
 * accidental misconfiguration leaving admin sessions effectively never-
 * idle.
 */
const ADMIN_SESSION_IDLE_MS_MAX = 4 * 60 * 60 * 1000;
const ADMIN_SESSION_IDLE_MS = Math.min(
    Number(process.env.ADMIN_SESSION_IDLE_MS) || 30 * 60 * 1000,
    ADMIN_SESSION_IDLE_MS_MAX,
);

/**
 * Record the initial password into history on successful register.
 * No reuse-check (first password is fresh by definition) — this just
 * seeds the history so future changes have a baseline to compare.
 */
const passwordHistoryRecorder = (actorType: "customer" | "user") => {
    return async (req: any, res: any, next: any) => {
        const password: unknown = req?.body?.password
        const email: string | undefined = req.body?.email
        if (
            typeof password !== "string" ||
            !password ||
            !email ||
            typeof email !== "string"
        ) {
            return next()
        }

        res.on("finish", () => {
            if (res.statusCode < 200 || res.statusCode >= 300) return
            try {
                const history = req.scope.resolve(
                    PASSWORD_HISTORY_MODULE,
                ) as PasswordHistoryService
                history
                    .record(email, actorType, password)
                    .catch((err) =>
                        logger.warn?.(
                            "[password-history] seed on register failed",
                            { err },
                        ),
                    )
            } catch {
                // Module unavailable — fail-open, policy + lockout still apply.
            }
        })
        return next()
    }
}

/**
 * Password-history guard for the customer + admin update-password routes
 * (POST /auth/{customer,user}/emailpass/update).
 *
 * Runs AFTER `passwordPolicyGuard` so the new password is already
 * known to meet the minimum policy (length, classes, etc).
 *
 * Two phases:
 *   - BEFORE: resolve the password_history service, load the last N
 *     hashes for (email, actor_type), scrypt-verify. Match → 422.
 *   - AFTER (status 2xx): record the new hash, trimming to N.
 *
 * Record-on-success is scheduled via `res.on("finish")` — fires after
 * the response has been flushed to the client, so the handler pipeline
 * stays synchronous even though the hash write is async.
 */
const passwordHistoryGuard = (actorType: "customer" | "user") => {
    return async (req: any, res: any, next: any) => {
        const password: unknown = req?.body?.password
        if (typeof password !== "string" || password.length === 0) {
            return next()
        }

        // Email comes from body on customer update (includes email), or
        // from the auth context on the authenticated admin update.
        const email: string | undefined =
            (req.body?.email as string | undefined) ??
            (req.auth_context?.actor_id_email as string | undefined) ??
            (req.auth_context?.app_metadata?.email as string | undefined)
        if (!email) {
            // Can't attribute history without an email — let the
            // downstream provider handle (will 401/400 if unauth).
            return next()
        }

        let history: PasswordHistoryService
        try {
            history = req.scope.resolve(
                PASSWORD_HISTORY_MODULE,
            ) as PasswordHistoryService
        } catch (err) {
            // Module not yet migrated / resolved — fail-open (policy +
            // lockout are still in effect) so this never causes a prod
            // outage.
            logger.warn?.("[password-history] module unavailable, skipping reuse check")
            return next()
        }

        try {
            const reused = await history.wasRecentlyUsed(
                email,
                actorType,
                password,
            )
            if (reused) {
                return res.status(422).json({
                    message:
                        "You've used this password recently. Pick a password you haven't used in the last 10 changes.",
                    code: "password_reuse_rejected",
                })
            }
        } catch (err) {
            logger.warn?.("[password-history] reuse check failed, allowing update", { err })
        }

        // Wrap res to record on success.
        const origStatus = res.status.bind(res)
        let recordedStatus: number | null = null
        res.status = (code: number) => {
            recordedStatus = code
            return origStatus(code)
        }

        // After the handler finishes (res.end fires once), record the
        // new password on success. `res.on("finish")` is the reliable
        // hook — it fires after headers+body have been flushed.
        res.on("finish", () => {
            const status = recordedStatus ?? res.statusCode
            if (status >= 200 && status < 300) {
                history
                    .record(email, actorType, password)
                    .catch((err) =>
                        logger.warn?.("[password-history] record failed", { err }),
                    )
            }
        })

        return next()
    }
}

/**
 * Account-lockout guard for login endpoints.
 *
 * - BEFORE the auth handler runs: reject with 429 + `Retry-After` if the
 *   (email, ip) pair is already locked.
 * - AFTER the auth handler writes its response: sniff the status code
 *   to decide whether to record a failure or clear the counter.
 *
 * The auth handler runs inside Medusa — we don't control it directly —
 * so the "after" hook is implemented by monkey-patching `res.status`.
 * Any 401 from the login route is treated as a failed attempt.
 */
const loginLockoutGuard = (req: any, res: any, next: any) => {
    const email = (req?.body?.email as string | undefined) ?? null
    const ip = (req.ip as string | undefined) ?? "unknown"

    const lock = isAccountLocked(email, ip)
    if (lock.locked) {
        const retrySec = Math.ceil(lock.retryAfterMs / 1000)
        res.setHeader("Retry-After", String(retrySec))
        return res.status(429).json({
            message:
                lock.reason === "email"
                    ? "Too many failed sign-in attempts for this account. Try again in a few minutes."
                    : "Too many failed sign-in attempts from your network. Try again in a few minutes.",
            code: "account_locked",
            retry_after_seconds: retrySec,
        })
    }

    // Observe the eventual response. We can't easily wrap res.json
    // because Medusa streams it; instead patch res.status which is
    // always called exactly once.
    const origStatus = res.status.bind(res)
    res.status = (code: number) => {
        try {
            if (code === 401 || code === 400) {
                recordLoginFailure(email, ip)
            } else if (code >= 200 && code < 300) {
                recordLoginSuccess(email, ip)
            }
        } catch {
            // never let accounting throw
        }
        return origStatus(code)
    }
    return next()
}

/**
 * Enforce the password-policy on every request that SETS a password
 * (register, reset via token, and the authenticated update flow).
 *
 * Runs BEFORE the emailpass provider handles the request, so an
 * unacceptable password is rejected with `422` and clear errors
 * instead of being hashed + stored.
 *
 * The same validator runs client-side — this server-side guard is the
 * authoritative one (client can be bypassed by anyone with curl).
 *
 * Note: the emailpass provider body shape is `{ email, password }` for
 * register and `{ password }` for update / reset. We only inspect
 * `req.body.password` and let the provider enforce everything else.
 */
const passwordPolicyGuard = (req: any, res: any, next: any) => {
    const body = (req && req.body) || {}
    const password: unknown = body.password

    // Missing password — let the auth provider produce its own error;
    // our job is only to reject weak-but-present passwords.
    if (typeof password !== "string" || password.length === 0) {
        return next()
    }

    // Pull context from the body / auth context so the policy can
    // reject "raj123456!A" when the customer's first-name is "raj".
    const email =
        typeof body.email === "string"
            ? body.email
            : (req.auth_context?.actor_id_email as string | undefined) ??
              (req.auth_context?.app_metadata?.email as string | undefined)

    const ctx = {
        email: email ?? null,
        firstName:
            (body.first_name as string | undefined) ??
            (req.auth_context?.app_metadata?.first_name as string | undefined) ??
            null,
        lastName:
            (body.last_name as string | undefined) ??
            (req.auth_context?.app_metadata?.last_name as string | undefined) ??
            null,
        phone:
            (body.phone as string | undefined) ??
            (req.auth_context?.app_metadata?.phone as string | undefined) ??
            null,
        pan:
            (body.pan as string | undefined) ??
            (req.auth_context?.app_metadata?.pan as string | undefined) ??
            null,
        dob:
            (body.dob as string | undefined) ??
            (req.auth_context?.app_metadata?.dob as string | undefined) ??
            null,
    }

    const check = validatePasswordPolicy(password, ctx)
    if (check.ok === false) {
        return res.status(422).json({
            message: "Password does not meet policy requirements.",
            code: "password_policy_violation",
            errors: check.errors,
            suggestions: check.suggestions,
        })
    }

    return next()
}

/**
 * `panNameLockGuard` — server-side enforcement of the "name-after-PAN
 * is immutable" rule. Once a customer has verified PAN, their legal
 * name is whatever the Income Tax Department returned — we can't let
 * them edit it via /store/customers/me because the next KYC name
 * match (against PAN, Aadhaar, bank, demat) would fail.
 *
 * Behaviour:
 *   - If the request has no first_name / last_name in body → no-op.
 *   - If the customer has no `metadata.pan_hash` → no lock yet, allow.
 *   - Otherwise: look up the global pan_record, split the registered
 *     name (first word → first_name, rest → last_name), and OVERWRITE
 *     the body fields with the locked values. We don't 4xx — the
 *     storefront UI already locks the field, so anything tampered is
 *     silently coerced back to the canonical name without breaking
 *     the round-trip.
 *
 * Runs after `validateBody(CustomerUpdateSchema)` so the body shape is
 * already trusted; we just rewrite specific keys.
 */
const panNameLockGuard = async (req: any, res: any, next: any) => {
    try {
        const body = (req && req.body) || {}
        const wantsRename =
            typeof body.first_name === "string" ||
            typeof body.last_name === "string"
        if (!wantsRename) return next()

        const customerId = req.auth_context?.app_metadata?.customer_id as
            | string
            | undefined
        if (!customerId) return next()

        // Resolve modules through the request scope so we don't bind
        // the wallet module at file-load time (avoids cyclic imports).
        const customerModule = req.scope.resolve("customer") as any
        const customer = await customerModule
            .retrieveCustomer(customerId)
            .catch(() => null)
        const meta = (customer?.metadata ?? {}) as Record<string, unknown>
        const panHash =
            typeof meta.pan_hash === "string" ? (meta.pan_hash as string) : null
        if (!panHash) return next()

        // Cashfree wallet module owns pan_record.
        const walletModule = req.scope.resolve(CASHFREE_WALLET_MODULE) as any
        const record = await walletModule
            .lookupPanRecordByHash(panHash)
            .catch(() => null)
        const lockedName: string | null =
            (typeof record?.registered_name === "string"
                ? record.registered_name
                : null) ??
            (typeof meta.pan_registered_name === "string"
                ? (meta.pan_registered_name as string)
                : null)
        if (!lockedName) return next()

        const words = lockedName
            .trim()
            .replace(/\s+/g, " ")
            .split(" ")
            .filter(Boolean)
        if (words.length === 0) return next()
        const first = words[0]
        const last = words.slice(1).join(" ")

        // Overwrite. We always set BOTH fields when we lock — even if
        // only one was sent — so a half-update can't drift the stored
        // pair away from the regulator's record.
        body.first_name = first
        body.last_name = last
        // Keep metadata.full_name in sync too, if the body touched
        // metadata. The customer module merges metadata shallowly.
        if (body.metadata && typeof body.metadata === "object") {
            ;(body.metadata as Record<string, unknown>).full_name = lockedName
        }
        req.body = body
        return next()
    } catch (err) {
        // Guard must never block writes if the lookup itself errors —
        // that would lock customers out of their own profile if the
        // wallet module hiccups. Log and let the write through.
        logger.warn("panNameLockGuard: skipped due to error", {
            error: (err as Error)?.message,
        })
        return next()
    }
}

const adminIdleTimeout = (req: any, res: any, next: any) => {
    const session = req.session
    if (!session) return next()

    const now = Date.now()
    const last = typeof session.admin_last_activity === "number"
        ? session.admin_last_activity
        : null

    if (last !== null && now - last > ADMIN_SESSION_IDLE_MS) {
        // Idle too long — wipe the session AND rotate the session ID
        // so a leaked cookie can't continue to be used from another
        // browser/tab (session-fixation hardening). Best-effort: if
        // regenerate or destroy fails we still 401, the point is to
        // deny further work with this session.
        session.admin_last_activity = undefined
        const regen =
            typeof session.regenerate === "function"
                ? (cb: () => void) => session.regenerate(cb)
                : (cb: () => void) => cb()
        regen(() => {
            if (typeof session.destroy === "function") {
                session.destroy(() => {
                    /* swallow — we already decided to 401 */
                })
            }
        })
        return res.status(401).json({
            message: "Admin session expired due to inactivity. Please sign in again.",
            code: "admin_session_idle_timeout",
        })
    }

    session.admin_last_activity = now
    return next()
}

/**
 * B2B MOQ guard (FR-3.03). Runs at cart completion: blocks the order with a
 * 409 if the cart violates per-product MOQ / carton-step or the wholesale
 * cart-total floor. Fail-OPEN on internal error so a validation bug can never
 * wedge all checkouts — a genuine violation still returns 409.
 */
const b2bMoqGuard = async (req: any, res: any, next: any) => {
    try {
        const { id } = req.params
        const result = await validateB2BCart(req.scope, id)
        if (!result.ok) {
            return res.status(409).json({
                message: "Cart does not meet wholesale order requirements.",
                code: "b2b_moq_violation",
                violations: result.violations,
                cart_total_units: result.cart_total_units,
                min_required: result.min_required,
            })
        }
    } catch (err) {
        logger.warn("b2bMoqGuard skipped due to error", {
            error: (err as Error)?.message,
        })
        // fail-open — never block checkout on a validation error
    }
    return next()
}

/**
 * Pre-delete reconcile for DELETE /admin/customers/:id.
 *
 * Medusa's core customer-delete tries to remove the linked auth identity when
 * `has_account = true`, and 404s with "Auth identity not found" if that
 * identity is missing — leaving the customer un-deletable from the admin. That
 * inconsistent state (registered flag set, but no login identity) can arise
 * from out-of-band auth cleanup. This guard clears `has_account` first when no
 * login identity exists for the customer's email, so the core delete proceeds
 * cleanly. Fail-open: a reconcile hiccup never blocks the delete.
 */
const customerDeleteReconcile = async (req: any, res: any, next: any) => {
    try {
        const id = req.params?.id
        if (id) {
            const pg = req.scope.resolve(
                ContainerRegistrationKeys.PG_CONNECTION,
            ) as { raw: (sql: string, b?: unknown[]) => Promise<unknown> }
            await pg.raw(
                `UPDATE customer
                    SET has_account = false, updated_at = now()
                  WHERE id = ?
                    AND has_account = true
                    AND NOT EXISTS (
                      SELECT 1 FROM provider_identity pi
                       WHERE pi.entity_id = customer.email
                    )`,
                [id],
            )
        }
    } catch {
        // never block the delete on a reconcile hiccup
    }
    return next()
}

export default defineMiddlewares({
    routes: [
        // ── Ported from the legacy textile backend (monorepo
        //    consolidation, 2026-06-19): request validation for the
        //    RBAC admin routes. ──
        {
            matcher: "/admin/roles",
            method: ["POST"],
            middlewares: [validateAndTransformBody(CreateRoleDto)],
        },
        {
            matcher: "/admin/roles",
            method: ["GET"],
            middlewares: [
                validateAndTransformQuery(ListRolesQueryDto, {
                    defaults: [
                        "id", "code", "display_name", "description",
                        "scope", "is_system", "active", "created_at",
                    ],
                }),
            ],
        },
        {
            matcher: "/admin/roles/:id",
            method: ["POST"],
            middlewares: [validateAndTransformBody(UpdateRoleDto)],
        },
        {
            matcher: "/admin/roles/:id/permissions",
            method: ["POST"],
            middlewares: [validateAndTransformBody(SetRolePermissionsDto)],
        },
        {
            matcher: "/admin/user-roles",
            method: ["POST"],
            middlewares: [validateAndTransformBody(GrantRoleDto)],
        },
        {
            matcher: "/admin/user-roles",
            method: ["GET"],
            middlewares: [
                validateAndTransformQuery(ListUserRolesQueryDto, {
                    defaults: [
                        "id", "actor_type", "actor_id", "role_id",
                        "company_id", "granted_by_user_id", "granted_at", "expires_at",
                    ],
                }),
            ],
        },
        {
            matcher: "/admin/permission-check",
            method: ["POST"],
            middlewares: [validateAndTransformBody(CheckPermissionDto)],
        },
        {
            // Make admin customer-delete robust to a missing auth identity
            // (see customerDeleteReconcile). Must run before Medusa's core
            // DELETE handler for this route.
            matcher: "/admin/customers/:id",
            method: ["DELETE"],
            middlewares: [customerDeleteReconcile],
        },
        {
            // Serve uploaded images / PDFs from the `medusa-uploads`
            // volume mounted at /app/static. @medusajs/file-local writes
            // to this dir but doesn't register an HTTP route — without
            // this middleware, every uploaded-image URL is a 404.
            //
            // `maxAge` is 1 year because file-local generates immutable
            // filenames (`<timestamp>-<name>`), so an uploaded file
            // never changes content under the same URL. `immutable`
            // tells browsers to skip revalidation.
            matcher: "/static/*",
            middlewares: [
                express.static(path.join(process.cwd(), "static"), {
                    maxAge: "1y",
                    immutable: true,
                    // fallthrough so files NOT on local disk (i.e. stored in
                    // the configured private S3 backend) fall through to the
                    // GET /static/* handler below, which fetches them.
                    fallthrough: true,
                }),
            ],
        },
        {
            // Blanket admin policy: rate-limit every /admin/* request and
            // enforce idle timeout. Auth itself is enforced per-route below;
            // this layer only applies once auth has populated `req.session`.
            // Keep this entry FIRST among admin routes so the limiter +
            // idle check fire before any other admin middleware.
            matcher: "/admin/*",
            middlewares: [
                adminLimiter,
                adminIdleTimeout,
            ],
        },
        {
            // Helmet on all API routes but NOT the admin dashboard.
            matcher: "*",
            middlewares: [
                (req: any, res: any, next: any) => {
                    // Prefer originalUrl — Medusa's middleware layer can leave
                    // req.path empty before the router resolves, so the old
                    // req.path-only check let Helmet's strict CSP through on
                    // /app responses, which blocks Vite's HMR preamble.
                    const fullPath = (req.originalUrl || req.url || req.path || "") as string;
                    if (fullPath.startsWith("/app")) {
                        // In dev, strip any CSP set upstream — Vite's React
                        // refresh injects an inline <script> and opens a ws
                        // HMR socket on a random port, both of which the
                        // default Helmet CSP blocks (→ blank admin page).
                        // Production keeps its CSP untouched.
                        if (process.env.NODE_ENV !== "production") {
                            res.removeHeader("Content-Security-Policy");
                            const origSetHeader = res.setHeader.bind(res);
                            res.setHeader = function (name: any, value: any) {
                                if (
                                    typeof name === "string" &&
                                    name.toLowerCase() === "content-security-policy"
                                ) {
                                    return res;
                                }
                                return origSetHeader(name, value);
                            };
                        }
                        // Fix Vite dev middleware Content-Type bug: the SPA
                        // fallback sets text/html on JS responses. Override
                        // for known Vite paths so browsers accept ES modules.
                        const origEnd = res.end;
                        res.end = function (...args: any[]) {
                            const ct = res.getHeader("content-type");
                            if (
                                typeof ct === "string" &&
                                ct.includes("text/html") &&
                                (fullPath.includes("@vite") ||
                                 fullPath.includes("@fs") ||
                                 fullPath.endsWith(".js") ||
                                 fullPath.endsWith(".jsx") ||
                                 fullPath.endsWith(".ts") ||
                                 fullPath.endsWith(".tsx") ||
                                 fullPath.endsWith(".mjs"))
                            ) {
                                res.setHeader("content-type", "text/javascript");
                            }
                            return origEnd.apply(this, args);
                        };
                        return next();
                    }
                    return helmet()(req, res, next);
                },
            ],
        },
        {
            matcher: "/store/upload",
            method: "POST",
            bodyParser: false,
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                (req, res, next) => {
                    logger.info(`Received ${req.method} request to ${req.url}`, { ip: req.ip });
                    next();
                },
                uploadLimiter,
                xMw(multer({
                    storage: multer.memoryStorage(),
                    limits: {
                        fileSize: 2 * 1024 * 1024, // 2MB
                    },
                    fileFilter: (req, file, cb) => {
                        const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
                        if (allowedTypes.includes(file.mimetype)) {
                            cb(null, true);
                        } else {
                            cb(new Error("Invalid file type. Only PDF, JPEG, and PNG are allowed."));
                        }
                    },
                }).single("file")),
                (req, res, next) => {
                    const file = (req as any).file;
                    if (file && file.buffer) {
                        // Validate magic bytes to prevent MIME spoofing
                        const buf = file.buffer;
                        const isPDF = buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
                        const isJPEG = buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
                        const isPNG = buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47
                            && buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A;
                        if (!isPDF && !isJPEG && !isPNG) {
                            return res.status(400).json({ message: "Invalid file content. File does not match expected format." });
                        }
                        // Force safe extension based on actual content
                        if (isPDF) file.originalname = file.originalname?.replace(/\.[^.]+$/, '') + '.pdf';
                        else if (isJPEG) file.originalname = file.originalname?.replace(/\.[^.]+$/, '') + '.jpg';
                        else if (isPNG) file.originalname = file.originalname?.replace(/\.[^.]+$/, '') + '.png';
                    }
                    logger.info(`Multer processed. File present: ${!!file}`);
                    next();
                },
            ],
        },
        {
            matcher: "/store/upload",
            method: "DELETE",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                uploadLimiter,
                (req, res, next) => {
                    logger.info(`Received DELETE request to ${req.url}`, { ip: req.ip });
                    next();
                },
            ],
        },
        {
            matcher: "/static/*",
            method: "GET",
            middlewares: [
                // Reached only when express.static above did NOT find the
                // file on local disk — i.e. it lives in the configured
                // PRIVATE S3 backend (MinIO/S3). Fetch it via the
                // private-storage reader and stream it back inline so admin
                // <img>/PDF viewers work. Path-traversal is guarded inside
                // privateBasename().
                async (req, res) => {
                    const fileName = privateBasename((req.params as any)?.[0] || req.path);
                    if (!fileName) {
                        return res.status(403).json({ message: "Access denied" });
                    }
                    const safeTypes: Record<string, string> = {
                        ".pdf": "application/pdf",
                        ".jpg": "image/jpeg",
                        ".jpeg": "image/jpeg",
                        ".png": "image/png",
                    };
                    const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
                    const contentType = safeTypes[ext];
                    if (!contentType) {
                        return res.status(403).json({ message: "File type not allowed" });
                    }
                    const buf = await readPrivateFile(`/static/${fileName}`);
                    if (!buf) {
                        return res.status(404).json({ message: "File not found" });
                    }
                    res.setHeader("Content-Type", contentType);
                    res.setHeader("X-Content-Type-Options", "nosniff");
                    res.setHeader("Cache-Control", "private, max-age=300");
                    return res.send(buf);
                }
            ]
        },
        {
            matcher: "/admin/products",
            method: ["POST"],
            additionalDataValidator: {
                // ISIN is optional at create time because Medusa v2 admin has
                // no product.create injection zone — the stock Create Product
                // form cannot send additional_data.isin. It is set post-create
                // via the calcula-fields widget on product.details.after
                // (which PATCHes metadata.isin on /admin/products/:id).
                //
                // Zod's `_zod` brand symbol disagrees between v3 and v4
                // releases of @medusajs/framework's bundled Zod and the
                // top-level Zod we depend on. Cast to keep TS happy —
                // the schema runs identically at runtime.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                isin: z.string().optional() as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                company_name: z.string().optional() as any,
            },
        },
        {
            matcher: "/admin/products/import-shares",
            method: "POST",
            bodyParser: false,
            middlewares: [
                authenticate("user", ["session", "bearer"]),
                xMw(multer({
                    storage: multer.memoryStorage(),
                    limits: { fileSize: 10 * 1024 * 1024 },
                    fileFilter: (req, file, cb) => {
                        const allowed = ["text/csv", "application/vnd.ms-excel", "application/octet-stream"];
                        if (allowed.includes(file.mimetype) || (file.originalname || "").toLowerCase().endsWith(".csv")) {
                            cb(null, true);
                        } else {
                            cb(new Error("Invalid file type. CSV only."));
                        }
                    },
                }).single("file")),
            ],
        },
        {
            matcher: "/admin/calcula/prices/bulk",
            method: "POST",
            bodyParser: false,
            middlewares: [
                authenticate("user", ["session", "bearer"]),
                xMw(multer({
                    storage: multer.memoryStorage(),
                    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
                    fileFilter: (req, file, cb) => {
                        const allowed = ["text/csv", "application/vnd.ms-excel", "application/octet-stream"];
                        if (allowed.includes(file.mimetype) || (file.originalname || "").toLowerCase().endsWith(".csv")) {
                            cb(null, true);
                        } else {
                            cb(new Error("Invalid file type. CSV only."));
                        }
                    },
                }).single("file")),
            ],
        },
        {
            matcher: "/store/calcula*",
            middlewares: [
                storeLimiter,
            ],
        },
        {
            matcher: "/store/marketplace-products*",
            middlewares: [
                storeLimiter,
            ],
        },
        {
            // Public forms — rate-limit aggressively to deter spam /
            // enumeration. 60 req/min/IP is already generous.
            matcher: "/store/contact",
            method: "POST",
            middlewares: [
                storeLimiter,
            ],
        },
        {
            matcher: "/store/newsletter",
            method: "POST",
            middlewares: [
                storeLimiter,
            ],
        },
        {
            matcher: "/admin/calcula*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/discount-codes*",
            middlewares: [authenticate("user", ["session", "bearer"])],
        },
        {
            // Supervision endpoint for scheduled jobs. Admin auth so
            // external uptime monitors can't scrape it anonymously,
            // but kept separate from the bulk admin routes so it can
            // be whitelisted from rate limits or IP allow-lists for
            // the monitoring tool.
            matcher: "/admin/job-health*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/wallets*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/held-orders*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/product-questions*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/product-reviews*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/secure-id-verifications*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/webhook-events*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/dev/cashfree-ping",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/cashfree-settings*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/ovo*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/manual-kyc-requests*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/kyc-overview",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/deposit-proofs*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
                adminLimiter,
            ],
        },
        {
            // B2B Sales domain — pricing / MOQ / visibility rule management.
            matcher: "/admin/b2b-sales*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            // Sales-rep admin (incl. FR-1.04 draft-cart-on-behalf).
            matcher: "/admin/sales-reps*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            // B2B Management domain — companies/reps/logistics/ERP ops
            // (incl. FR-10.02 transporter assignment).
            matcher: "/admin/b2b-management*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            // B2B Sales storefront reads — tier pricing / MOQ / visibility
            // for the PDP. Optional auth lets public catalogue visitors see
            // the default wholesale ladder while signed-in buyers get their tier.
            matcher: "/store/b2b-sales*",
            middlewares: [
                authenticate("customer", ["session", "bearer"], {
                    allowUnauthenticated: true,
                }),
                storeLimiter,
            ],
        },
        {
            matcher: "/admin/company-requests*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/contact-submissions*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            // DPDP Act data-subject request inbox.
            matcher: "/admin/account-requests*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            // Customer-facing DPDP request endpoints. Both list + create
            // require an authenticated customer session — no guests.
            matcher: "/store/account*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                storeLimiter,
            ],
        },
        {
            matcher: "/admin/newsletter-subscriptions*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/store/company-requests*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            matcher: "/store/watchlist*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/customers/:customer_id/kyc/manual",
            method: "POST",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            // Customer 360 admin endpoints — KYC edit, files, audit log.
            matcher: "/admin/customers/:customer_id/kyc",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/customers/:customer_id/files",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/customers/:customer_id/pan-record",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/customers/:customer_id/aadhaar-record",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/customers/:customer_id/audit-log",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/bank-accounts/:id/verify",
            method: "POST",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            // Bank list + per-id edit/delete (non-financial fields).
            matcher: "/admin/bank-accounts*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/demat-accounts/:id/verify",
            method: "POST",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/demat-accounts*",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/admin/customers/:customer_id/attach-file",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
            ],
        },
        {
            // Admin upload — same multer + magic-byte validation as /store/upload.
            matcher: "/admin/upload",
            method: "POST",
            bodyParser: false,
            middlewares: [
                authenticate("user", ["session", "bearer"]),
                uploadLimiter,
                xMw(multer({
                    storage: multer.memoryStorage(),
                    limits: { fileSize: 2 * 1024 * 1024 },
                    fileFilter: (req, file, cb) => {
                        const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
                        if (allowedTypes.includes(file.mimetype)) {
                            cb(null, true);
                        } else {
                            cb(new Error("Invalid file type. Only PDF, JPEG, and PNG are allowed."));
                        }
                    },
                }).single("file")),
                (req, res, next) => {
                    const file = (req as any).file;
                    if (file && file.buffer) {
                        const buf = file.buffer;
                        const isPDF = buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
                        const isJPEG = buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
                        const isPNG = buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47
                            && buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A;
                        if (!isPDF && !isJPEG && !isPNG) {
                            return res.status(400).json({ message: "Invalid file content." });
                        }
                        if (isPDF) file.originalname = file.originalname?.replace(/\.[^.]+$/, '') + '.pdf';
                        else if (isJPEG) file.originalname = file.originalname?.replace(/\.[^.]+$/, '') + '.jpg';
                        else if (isPNG) file.originalname = file.originalname?.replace(/\.[^.]+$/, '') + '.png';
                    }
                    next();
                },
            ],
        },
        {
            matcher: "/admin/upload",
            method: "DELETE",
            middlewares: [
                authenticate("user", ["session", "bearer"]),
                uploadLimiter,
            ],
        },
        {
            matcher: "/store/notifications*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
            ],
        },
        {
            matcher: "/store/kyc*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
            ],
        },
        {
            // Multipart upload from the price-scraper's company-image
            // tool. Has to be registered BEFORE the generic /webhooks/*
            // entry below so multer (not the JSON parser) handles the
            // body. Matches only the exact upload-thumbnail route — every
            // other /webhooks/calcula/* endpoint still goes through the
            // raw-body-preserving JSON path.
            matcher: "/webhooks/calcula/upload-thumbnail",
            method: ["POST"],
            bodyParser: false,
            middlewares: [
                xMw(multer({
                    storage: multer.memoryStorage(),
                    limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB — pre-optimisation cap
                    fileFilter: (req, file, cb) => {
                        const allowed = [
                            "image/webp",
                            "image/jpeg",
                            "image/png",
                            "image/svg+xml",
                        ]
                        if (allowed.includes(file.mimetype)) {
                            cb(null, true)
                        } else {
                            cb(new Error(`Unsupported image type: ${file.mimetype}`))
                        }
                    },
                }).single("file")),
            ],
        },
        {
            // HMAC signature verification needs the exact bytes Cashfree
            // posted — JSON re-serialisation would break the digest. Preserve
            // the raw body on all webhook routes.
            matcher: "/webhooks/*",
            method: ["POST"],
            bodyParser: { preserveRawBody: true },
        },
        {
            // /store/wallet* is gated on full verification — there's no
            // point exposing balance / transactions to a customer who
            // hasn't completed email + WhatsApp OTP. The verification
            // gate fires AFTER authenticate so it always has a customer
            // id to look up.
            matcher: "/store/wallet*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            matcher: "/store/bank-accounts*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            matcher: "/store/backorders*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            matcher: "/store/credit-terms*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            matcher: "/store/purchase-orders*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            matcher: "/store/saved-carts*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            // PUBLIC — token is the only credential, so a recipient
            // doesn't need an account. Rate-limited to slow brute force
            // on the token namespace.
            matcher: "/store/shared-carts*",
            middlewares: [
                storeLimiter,
            ],
        },
        {
            matcher: "/store/orders/:id/invoice",
            method: "GET",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            matcher: "/store/shipments*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            matcher: "/store/demat-accounts*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
            ],
        },
        {
            // /store/checkout* — every step of the checkout flow
            // (begin, precheck, razorpay/verify) is gated on full
            // verification. RISITEX policy: no order without verified
            // email + WhatsApp.
            matcher: "/store/checkout*",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            matcher: "/store/customers/me",
            middlewares: [
                maskCustomerResponse,
            ],
        },
        {
            matcher: "/store/customers/me",
            method: "POST",
            middlewares: [
                validateBody(CustomerUpdateSchema),
                panNameLockGuard,
            ],
        },
        {
            // Login endpoint — per-IP rate-limit + per-account lockout.
            matcher: "/auth/customer/emailpass",
            method: "POST",
            middlewares: [
                authLimiter,
                loginLockoutGuard,
            ],
        },
        {
            // Account-existence probe for the sign-in form. Rate-limited
            // because it is an enumeration oracle (accepted trade-off for
            // the "no account / wrong password" UX distinction).
            matcher: "/store/auth/account-exists",
            method: ["POST"],
            middlewares: [
                storeLimiter,
            ],
        },
        {
            // Phone-OTP login + verification endpoints. The handler
            // implements per-phone + per-IP rate buckets internally
            // (so SMS bombing is blocked even when an attacker rotates
            // proxies); this middleware just enforces a coarse per-IP
            // cap on top so a single client can't spam the route fast
            // enough to thrash the in-memory rate counters.
            matcher: "/store/auth/phone-otp/*",
            method: ["POST"],
            middlewares: [
                authLimiter,
            ],
        },
        {
            // PAN-linked phone OTP — same rate-limit envelope as
            // phone-otp/*. The handlers themselves add a per-PAN bucket
            // on top so an attacker can't bomb a single PAN with codes
            // even if they rotate IPs.
            matcher: "/store/auth/pan-otp/*",
            method: ["POST"],
            middlewares: [
                authLimiter,
            ],
        },
        {
            // Email-OTP verification endpoints. The handlers each
            // implement per-email + per-IP rate buckets internally
            // (same envelope as phone-OTP); this layer applies a
            // coarse per-IP cap so a single client can't burn through
            // the in-memory counters.
            //
            // Auth (`authenticate("customer", ...)`) is enforced via
            // the per-route handler — `send` and `resend` read the
            // session email from the customer module rather than the
            // request body, which is the defence against OTP-bombing
            // arbitrary inboxes.
            matcher: "/store/auth/email-otp/*",
            method: ["POST"],
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                authLimiter,
            ],
        },
        {
            // Admin login — same lockout policy.
            matcher: "/auth/user/emailpass",
            method: "POST",
            middlewares: [
                authLimiter,
                loginLockoutGuard,
            ],
        },
        {
            matcher: "/auth/customer/emailpass/register",
            method: "POST",
            middlewares: [
                authLimiter,
                // Enforce policy server-side — bypasses any client-side
                // weakening (curl, old SPA cache, etc).
                passwordPolicyGuard,
                passwordHistoryRecorder("customer"),
            ],
        },
        {
            // PUT /auth/customer/emailpass/update?token=…  is Medusa v2's
            // actual password-change endpoint (reset via emailed token AND
            // the authenticated "change my password" flow both land here).
            // Policy + history guards are AUTHORITATIVE here.
            matcher: "/auth/customer/emailpass/update",
            method: ["POST", "PUT"],
            middlewares: [
                authLimiter,
                passwordPolicyGuard,
                passwordHistoryGuard("customer"),
            ],
        },
        {
            // Admin user password set flows. Same guards apply — a weak
            // admin password is a higher-severity risk than a customer one.
            matcher: "/auth/user/emailpass/register",
            method: "POST",
            middlewares: [
                authLimiter,
                passwordPolicyGuard,
                passwordHistoryRecorder("user"),
            ],
        },
        {
            matcher: "/auth/user/emailpass/update",
            method: ["POST", "PUT"],
            middlewares: [
                authLimiter,
                passwordPolicyGuard,
                passwordHistoryGuard("user"),
            ],
        },
        {
            // Password-reset trigger: stricter than login. Attackers can
            // spam this endpoint to bomb arbitrary inboxes or enumerate
            // which emails have accounts (response differs subtly from a
            // non-existent email). 5/min per IP + global soft cap is
            // plenty for a legit user who might retry a couple times.
            matcher: "/auth/customer/emailpass/reset-password",
            middlewares: [
                rateLimit({
                    windowMs: 60 * 1000,
                    max: 5,
                    standardHeaders: true,
                    legacyHeaders: false,
                    store: makeRateLimitStore("reset"),
                    handler: (_req, res) => {
                        res.status(429).json({
                            message:
                                "Too many password-reset attempts. Please wait a minute and try again.",
                        })
                    },
                }),
            ],
        },
        {
            matcher: "/store/customers",
            method: "POST",
            middlewares: [
                authLimiter,
            ],
        },
        {
            matcher: "/store/carts/:id/discount-code",
            middlewares: [authenticate("customer", ["session", "bearer"])],
        },
        {
            matcher: "/store/carts/:id/volume-discount",
            middlewares: [authenticate("customer", ["session", "bearer"])],
        },
        {
            matcher: "/store/rep/me",
            middlewares: [authenticate("customer", ["session", "bearer"])],
        },
        {
            // Phase D.4 — customer-facing wallet-apply / wallet-clear
            // companions to /admin/wallets/*. Auth + verification gate.
            matcher: "/store/carts/:id/wallet-apply",
            method: "POST",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            matcher: "/store/carts/:id/wallet-clear",
            method: "POST",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
            ],
        },
        {
            matcher: "/store/carts/:id/complete",
            method: "POST",
            middlewares: [
                authenticate("customer", ["session", "bearer"]),
                requireVerifiedCustomer,
                async (req, res, next) => {
                    // The KYC gate used to live here — it returned 403 if the
                    // customer's derived KYC status wasn't "approved". That's
                    // been removed: customers can now place orders before KYC
                    // is complete. The payment provider (cashfree-wallet)
                    // records the order as held until KYC is approved AND the
                    // wallet covers the total, and the storefront displays
                    // the pending-requirements checklist on the success
                    // screen so the customer knows what's needed to trigger
                    // share delivery.
                    //
                    // All we enforce here now is cart ownership.
                    const { id } = req.params;
                    const cartModule = (req as any).scope.resolve("cart") as any;
                    const customerId = (req as any).auth_context?.app_metadata?.customer_id;
                    if (!customerId) {
                        return res.status(403).json({
                            message: "Authentication required to complete a purchase."
                        });
                    }
                    try {
                        const cart = await cartModule.retrieveCart(id);
                        if (!cart.customer_id || cart.customer_id !== customerId) {
                            return res.status(403).json({
                                message: "You can only complete your own cart."
                            });
                        }
                        next();
                    } catch (error) {
                        logger.error("Cart ownership check failed", { cartId: id, error });
                        return res.status(500).json({
                            message: "Unable to complete the purchase. Please try again later."
                        });
                    }
                },
                b2bMoqGuard,
            ]
        }
    ],
})
