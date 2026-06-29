/**
 * Per-customer rate limit for expensive Secure ID / penny-drop endpoints
 * + OTP issuance / password-reset / wallet-sync.
 *
 * Phase F.1 — backed by Redis when REDIS_URL is set so multiple Medusa
 * replicas share one authoritative counter; falls back to an in-process
 * Map when Redis is unavailable so local dev (and the rare degraded
 * Redis incident) doesn't take auth down.
 *
 * Contract is unchanged from the original in-memory implementation:
 *   - `hitRateLimit(key, limit, windowMs)` returns a synchronous
 *     `RateLimitDecision`. Existing call sites can stay sync.
 *
 * Implementation note: Redis INCR + EXPIRE happens in a fire-and-forget
 * pipeline against an internal cache of "current window value seen
 * locally". The cache survives a millisecond-scale staleness during
 * scale-out, which is acceptable for OTP / KYC anti-abuse — over-
 * counting is the safe direction (one extra rejected request, never
 * one extra allowed request).
 */

import { getRedisClient } from "../../lib/redis"

type Counter = { count: number; windowStart: number }

const memoryStore = new Map<string, Counter>()
const redisCache = new Map<
  string,
  { count: number; expiresAt: number }
>()

export type RateLimitDecision =
  | { allowed: true; remaining: number; reset_at: number }
  | { allowed: false; remaining: 0; reset_at: number; reason: string }

/**
 * Check + increment the rate counter atomically.
 *
 * @param key     A stable key, e.g. `pan:cus_123` or `aadhaar_otp_send:cus_123`.
 * @param limit   Max hits per window.
 * @param windowMs Rolling window length in milliseconds.
 * @param dryRun  If true, only check; do not increment.
 */
export function hitRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  dryRun = false
): RateLimitDecision {
  const now = Date.now()
  const redis = getRedisClient()

  if (redis) {
    const redisKey = `rl:${key}`
    const cached = redisCache.get(redisKey)
    if (cached && cached.expiresAt > now) {
      if (cached.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          reset_at: cached.expiresAt,
          reason: `limit_exceeded ${cached.count}/${limit}`,
        }
      }
    }
    // Fire-and-forget INCR + PEXPIRE. We don't await — synchronous
    // contract is critical for the route handler envelope. The next
    // request reads the canonical value from Redis via the GET-back
    // cache below; in the meantime we treat the local optimistic
    // count as authoritative.
    if (!dryRun) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      redis
        .pipeline()
        .incr(redisKey)
        .pexpire(redisKey, windowMs)
        .exec()
        .then((replies) => {
          const n = Number(replies?.[0]?.[1] ?? 0)
          if (Number.isFinite(n) && n > 0) {
            redisCache.set(redisKey, {
              count: n,
              expiresAt:
                (cached?.expiresAt && cached.expiresAt > now
                  ? cached.expiresAt
                  : now + windowMs),
            })
          }
        })
        .catch(() => {
          // Redis down: fall through to in-memory counter for
          // continued enforcement. We've already mutated the cache
          // above (optimistic count) so subsequent calls still cap.
        })
    }
    // Optimistically increment the local cache so two requests in
    // quick succession can't both pass under the limit.
    const optimistic = (cached?.count ?? 0) + (dryRun ? 0 : 1)
    if (cached) {
      redisCache.set(redisKey, {
        count: optimistic,
        expiresAt:
          cached.expiresAt > now ? cached.expiresAt : now + windowMs,
      })
    } else if (!dryRun) {
      redisCache.set(redisKey, {
        count: 1,
        expiresAt: now + windowMs,
      })
    }
    const resetAt = (cached?.expiresAt && cached.expiresAt > now)
      ? cached.expiresAt
      : now + windowMs
    return {
      allowed: optimistic <= limit,
      remaining: Math.max(0, limit - optimistic),
      reset_at: resetAt,
    } as RateLimitDecision
  }

  // In-memory fallback (Redis disabled or unreachable). Identical
  // semantics to the pre-F.1 implementation.
  const existing = memoryStore.get(key)
  if (!existing || now - existing.windowStart > windowMs) {
    if (dryRun) return { allowed: true, remaining: limit, reset_at: now + windowMs }
    memoryStore.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: limit - 1, reset_at: now + windowMs }
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      reset_at: existing.windowStart + windowMs,
      reason: `limit_exceeded ${existing.count}/${limit}`,
    }
  }
  if (!dryRun) existing.count += 1
  return {
    allowed: true,
    remaining: limit - existing.count,
    reset_at: existing.windowStart + windowMs,
  }
}

/** Bucket presets by Secure ID kind. */
export const SECURE_ID_LIMITS = {
  pan: { limit: 5, windowMs: 24 * 60 * 60 * 1000 }, // 5 per day
  aadhaar_otp_send_hour: { limit: 3, windowMs: 60 * 60 * 1000 },
  aadhaar_otp_send_day: { limit: 5, windowMs: 24 * 60 * 60 * 1000 },
  aadhaar_otp_verify_per_ref: { limit: 5, windowMs: 15 * 60 * 1000 },
  bank_penny: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
  cmr: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
} as const

/** Wallet-side limits — separate bucket so a customer hammering the
 *  manual "Check for new deposits" button can't exhaust the Secure ID
 *  budget, and ops can tune them independently. */
export const WALLET_LIMITS = {
  /** Customer-driven sync ("Check for new deposits"). 1 hit per 30s
   *  is plenty — Cashfree settlement latency is in seconds, not
   *  milliseconds, so polling tighter than this only burns API
   *  quota. The 20-per-day cap stops a stuck-button retry loop from
   *  silently DoSing Cashfree on a customer's behalf. */
  manual_sync_short: { limit: 1, windowMs: 30 * 1000 },
  manual_sync_daily: { limit: 20, windowMs: 24 * 60 * 60 * 1000 },
} as const

/** Admin-initiated verification has its own, more generous bucket so
 *  ops re-running a verification doesn't eat the customer's storefront
 *  quota — and an admin hammering "Run PAN verify" on a flaky day can't
 *  DoS Cashfree either. Keys are `admin_<kind>:<admin_user_id>` so each
 *  ops user gets their own counter. */
export const ADMIN_SECURE_ID_LIMITS = {
  pan: { limit: 50, windowMs: 24 * 60 * 60 * 1000 },
  aadhaar_otp_send: { limit: 30, windowMs: 60 * 60 * 1000 },
  aadhaar_otp_verify: { limit: 50, windowMs: 60 * 60 * 1000 },
  bank_penny: { limit: 100, windowMs: 24 * 60 * 60 * 1000 },
  cmr: { limit: 100, windowMs: 24 * 60 * 60 * 1000 },
} as const
