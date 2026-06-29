/**
 * Account-lockout counter for `/auth/customer/emailpass` POST (login).
 *
 * Problem: the stock `authLimiter` rate-limits per IP (10 attempts /
 * min). That alone doesn't stop a distributed brute-force — an attacker
 * with 1000 IPs gets 10,000 attempts/min against one account. We need a
 * per-IDENTITY counter in addition to per-IP.
 *
 * Strategy (in-memory):
 *
 *   - Key: `email:<lowercased-email>` and `ip:<request.ip>`
 *   - Keep sliding-window counts over the last N minutes.
 *   - After 5 consecutive failures on the same email (across any IP),
 *     lock for 15 minutes.
 *   - After 20 failures from the same IP (regardless of email), lock
 *     that IP for 15 minutes. (Catches credential-stuffing.)
 *   - Clear the counter on successful login.
 *
 * Why in-memory, not Redis or DB:
 *
 *   - Single VPS, single Medusa container — process restart wipes
 *     counters, which is fine: worst case a locked-out attacker gets
 *     to retry after a deploy, which is rare. A brute-force attack
 *     tolerates no such gap because the attack already broke through
 *     if the deploy wiped state.
 *   - If we scale horizontally, replace this file's Map with a Redis
 *     `INCR + EXPIRE` pair. The exported API (`recordFailure`,
 *     `recordSuccess`, `isLocked`) stays the same.
 *
 * Failures are recorded by a subscriber on `auth.failed` (not wired
 * here — Medusa doesn't emit that event in v2, so we piggy-back on
 * the login-route middleware which inspects the response status).
 */

type BucketEntry = { count: number; lockedUntil: number | null; first: number };

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes — matches lockout duration
const LOCK_MS = 15 * 60 * 1000; // 15 minutes

const EMAIL_THRESHOLD = 5;
const IP_THRESHOLD = 20;

const emailBuckets = new Map<string, BucketEntry>();
const ipBuckets = new Map<string, BucketEntry>();

function gc(map: Map<string, BucketEntry>, now: number) {
    // Drop entries whose lock has expired AND whose window has passed.
    // Cheap O(n) sweep — the map never grows beyond the active
    // attacker surface (usually < 1k keys even under attack).
    for (const [k, v] of map) {
        const windowOver = now - v.first > WINDOW_MS;
        const unlocked = !v.lockedUntil || v.lockedUntil < now;
        if (windowOver && unlocked) {
            map.delete(k);
        }
    }
}

function bump(
    map: Map<string, BucketEntry>,
    key: string,
    threshold: number,
): BucketEntry {
    const now = Date.now();
    if (Math.random() < 0.01) gc(map, now); // ~1% of calls, amortised

    let entry = map.get(key);
    if (!entry || now - entry.first > WINDOW_MS) {
        entry = { count: 0, lockedUntil: null, first: now };
        map.set(key, entry);
    }
    entry.count += 1;

    if (entry.count >= threshold) {
        entry.lockedUntil = now + LOCK_MS;
    }

    return entry;
}

export function recordFailure(email: string | null | undefined, ip: string) {
    if (email) {
        bump(emailBuckets, `email:${email.toLowerCase()}`, EMAIL_THRESHOLD);
    }
    bump(ipBuckets, `ip:${ip}`, IP_THRESHOLD);
}

export function recordSuccess(email: string | null | undefined, ip: string) {
    if (email) emailBuckets.delete(`email:${email.toLowerCase()}`);
    ipBuckets.delete(`ip:${ip}`);
}

/**
 * Returns either `{ locked: false }` or `{ locked: true, retryAfterMs }`.
 * Does NOT mutate the counter — call this before `recordFailure` so
 * failed attempts against a locked account continue to extend the
 * window (important: otherwise the lock becomes non-sticky).
 */
export function isLocked(
    email: string | null | undefined,
    ip: string,
): { locked: false } | { locked: true; retryAfterMs: number; reason: "email" | "ip" } {
    const now = Date.now();
    const emailKey = email ? `email:${email.toLowerCase()}` : null;

    if (emailKey) {
        const e = emailBuckets.get(emailKey);
        if (e?.lockedUntil && e.lockedUntil > now) {
            return { locked: true, retryAfterMs: e.lockedUntil - now, reason: "email" };
        }
    }
    const i = ipBuckets.get(`ip:${ip}`);
    if (i?.lockedUntil && i.lockedUntil > now) {
        return { locked: true, retryAfterMs: i.lockedUntil - now, reason: "ip" };
    }
    return { locked: false };
}

/** Test helper — only called from jest / vitest. */
export function __resetAccountLockout() {
    emailBuckets.clear();
    ipBuckets.clear();
}
