import Redis from "ioredis"

/**
 * Singleton ioredis client used by the rate-limit layer.
 *
 * Why a separate client (not the one the framework's redis modules
 * already configured):
 *   - The event-bus / cache / workflow-engine clients are
 *     `framework-internal` — they're scoped to module containers and
 *     not exposed via DI. Resolving them at middleware-load time is
 *     order-sensitive.
 *   - Rate-limit operations (INCR + EXPIRE) are pipeline-safe and
 *     don't share state with the other Redis-backed modules, so a
 *     dedicated client adds zero coordination overhead.
 *
 * Falls through to `null` when REDIS_URL isn't set — the rate-limit
 * helpers below detect that and degrade to in-process counters.
 * This keeps `pnpm dev` workable on machines without Redis while
 * staying cluster-safe under prod.
 */

let _client: Redis | null = null
let _initAttempted = false

export function getRedisClient(): Redis | null {
  if (_initAttempted) return _client
  _initAttempted = true
  const url = process.env.REDIS_URL
  if (!url) {
    return null
  }
  try {
    _client = new Redis(url, {
      // Lazy connect so module-load doesn't block on Redis startup —
      // matters in CI / fresh-clone smoke tests where the dev container
      // boots in parallel with Redis.
      lazyConnect: false,
      // Three retries with capped backoff. After that the client
      // surfaces errors which the rate-limit helpers treat as
      // "fail-open" so a degraded Redis doesn't take checkout down.
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times) {
        if (times > 5) return null
        return Math.min(times * 200, 2000)
      },
    })
    _client.on("error", (err) => {
      // Don't crash the process — log and continue. Per-request
      // failures fail-open inside hitRateLimit.
      // eslint-disable-next-line no-console
      console.warn(
        `[redis] rate-limit client error: ${err.message ?? String(err)}`,
      )
    })
    return _client
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[redis] could not init rate-limit client: ${(err as Error).message}`,
    )
    return null
  }
}
