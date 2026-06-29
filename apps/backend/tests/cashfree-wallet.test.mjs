// Pure-function tests for the Cashfree/wallet security primitives. These
// are the most costly to get wrong — silent signature-verify bugs would let
// an attacker forge wallet credits, silent crypto bugs could leak stored
// bank account numbers.
//
// The tests duplicate the implementation inline rather than importing the
// source — same pattern as tests/sync-helpers.test.mjs — so we can run them
// with plain `node` without spinning up the Medusa build.
//
// Run:  node backend/tests/cashfree-wallet.test.mjs

import { createHmac, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// ── Implementations under test (copied verbatim) ────────────────

const MAX_WEBHOOK_SKEW_SECONDS = 5 * 60;

function verifyWebhookSignature({ rawBody, signatureHeader, timestampHeader, secret, now }) {
  if (!secret) return { ok: false, reason: "missing_secret" };
  const sig = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  const ts = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
  if (!sig) return { ok: false, reason: "missing_signature" };
  if (!ts) return { ok: false, reason: "missing_timestamp" };
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "invalid_timestamp" };
  const nowSec = Math.floor((now ?? Date.now()) / 1000);
  if (Math.abs(nowSec - tsNum) > MAX_WEBHOOK_SKEW_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expectedB64 = createHmac("sha256", secret).update(ts + bodyStr).digest("base64");
  const expected = Buffer.from(expectedB64, "utf8");
  const provided = Buffer.from(sig, "utf8");
  if (expected.length !== provided.length) return { ok: false, reason: "signature_mismatch" };
  if (!timingSafeEqual(expected, provided)) return { ok: false, reason: "signature_mismatch" };
  return { ok: true };
}

const VERSION = "v1";
const SCRYPT_SALT = "polemarch-cashfree-wallet-v1";
const KEY_LENGTH = 32;

function deriveKey(secret) {
  return scryptSync(secret, SCRYPT_SALT, KEY_LENGTH);
}

function encryptString(plain, secret) {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}
function decryptString(payload, secret) {
  const parts = payload.split(".");
  if (parts.length !== 4) throw new Error("malformed");
  const [version, ivB64, tagB64, ctB64] = parts;
  if (version !== VERSION) throw new Error(`unsupported version ${version}`);
  const key = deriveKey(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return pt.toString("utf8");
}

function maskPan(value) {
  const v = value.toUpperCase().replace(/\s+/g, "");
  if (v.length !== 10) return "XXXXX****X";
  return `${v.slice(0, 5)}****${v.slice(9)}`;
}
function maskAadhaar(value) {
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned.length < 4) return "XXXX-XXXX-XXXX";
  return `XXXX-XXXX-${cleaned.slice(-4)}`;
}
function last4(value) {
  return value.replace(/\s+/g, "").slice(-4);
}

// in-memory rate limiter (copied)
const rlStore = new Map();
function hitRateLimit(key, limit, windowMs, dryRun = false) {
  const now = Date.now();
  const existing = rlStore.get(key);
  if (!existing || now - existing.windowStart > windowMs) {
    if (dryRun) return { allowed: true, remaining: limit, reset_at: now + windowMs };
    rlStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, reset_at: now + windowMs };
  }
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, reset_at: existing.windowStart + windowMs };
  }
  if (!dryRun) existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, reset_at: existing.windowStart + windowMs };
}

// ── Harness ─────────────────────────────────────────────────────

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`      ${e.message}`);
    failed++;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? "assertion failed");
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg ?? ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ── webhook signature ───────────────────────────────────────────

console.log("verifyWebhookSignature():");

const SECRET = "test-webhook-secret-polemarch";
const NOW_MS = 1_744_000_000_000;
const BODY = '{"event":"vba_credit","data":{"amount":1000}}';
const goodTs = String(Math.floor(NOW_MS / 1000));
const goodSig = createHmac("sha256", SECRET).update(goodTs + BODY).digest("base64");

test("valid sig + fresh timestamp → ok", () => {
  const r = verifyWebhookSignature({ rawBody: BODY, signatureHeader: goodSig, timestampHeader: goodTs, secret: SECRET, now: NOW_MS });
  assert(r.ok === true);
});

test("tampered body → signature_mismatch", () => {
  const r = verifyWebhookSignature({ rawBody: BODY + "EXTRA", signatureHeader: goodSig, timestampHeader: goodTs, secret: SECRET, now: NOW_MS });
  assertEq(r.ok, false);
  assertEq(r.reason, "signature_mismatch");
});

test("wrong signature → signature_mismatch", () => {
  const r = verifyWebhookSignature({ rawBody: BODY, signatureHeader: "AAAA", timestampHeader: goodTs, secret: SECRET, now: NOW_MS });
  assertEq(r.ok, false);
  assertEq(r.reason, "signature_mismatch");
});

test("missing secret → missing_secret", () => {
  const r = verifyWebhookSignature({ rawBody: BODY, signatureHeader: goodSig, timestampHeader: goodTs, secret: "", now: NOW_MS });
  assertEq(r.ok, false);
  assertEq(r.reason, "missing_secret");
});

test("missing signature header → missing_signature", () => {
  const r = verifyWebhookSignature({ rawBody: BODY, signatureHeader: undefined, timestampHeader: goodTs, secret: SECRET, now: NOW_MS });
  assertEq(r.ok, false);
  assertEq(r.reason, "missing_signature");
});

test("stale timestamp (6 min old) → stale_timestamp", () => {
  const staleTs = String(Math.floor(NOW_MS / 1000) - 6 * 60);
  const staleSig = createHmac("sha256", SECRET).update(staleTs + BODY).digest("base64");
  const r = verifyWebhookSignature({ rawBody: BODY, signatureHeader: staleSig, timestampHeader: staleTs, secret: SECRET, now: NOW_MS });
  assertEq(r.ok, false);
  assertEq(r.reason, "stale_timestamp");
});

test("future timestamp (6 min ahead) → stale_timestamp", () => {
  const futTs = String(Math.floor(NOW_MS / 1000) + 6 * 60);
  const futSig = createHmac("sha256", SECRET).update(futTs + BODY).digest("base64");
  const r = verifyWebhookSignature({ rawBody: BODY, signatureHeader: futSig, timestampHeader: futTs, secret: SECRET, now: NOW_MS });
  assertEq(r.ok, false);
  assertEq(r.reason, "stale_timestamp");
});

test("timestamp exactly at skew limit (5 min) → ok", () => {
  const edgeTs = String(Math.floor(NOW_MS / 1000) - 5 * 60);
  const edgeSig = createHmac("sha256", SECRET).update(edgeTs + BODY).digest("base64");
  const r = verifyWebhookSignature({ rawBody: BODY, signatureHeader: edgeSig, timestampHeader: edgeTs, secret: SECRET, now: NOW_MS });
  assert(r.ok === true);
});

test("non-numeric timestamp → invalid_timestamp", () => {
  const r = verifyWebhookSignature({ rawBody: BODY, signatureHeader: goodSig, timestampHeader: "notanumber", secret: SECRET, now: NOW_MS });
  assertEq(r.ok, false);
  assertEq(r.reason, "invalid_timestamp");
});

test("buffer body round-trips", () => {
  const r = verifyWebhookSignature({ rawBody: Buffer.from(BODY, "utf8"), signatureHeader: goodSig, timestampHeader: goodTs, secret: SECRET, now: NOW_MS });
  assert(r.ok === true);
});

test("array-wrapped headers picked first value", () => {
  const r = verifyWebhookSignature({ rawBody: BODY, signatureHeader: [goodSig, "other"], timestampHeader: [goodTs], secret: SECRET, now: NOW_MS });
  assert(r.ok === true);
});

// ── crypto round-trip ───────────────────────────────────────────

console.log("\nencryptString / decryptString:");

const ENC_SECRET = "0123456789abcdef0123456789abcdef";

test("round-trips a bank account number", () => {
  const p = "1234567890";
  const ct = encryptString(p, ENC_SECRET);
  assert(ct.startsWith("v1."));
  assertEq(decryptString(ct, ENC_SECRET), p);
});

test("round-trips unicode", () => {
  const p = "नमस्ते 🏦 polémarch";
  assertEq(decryptString(encryptString(p, ENC_SECRET), ENC_SECRET), p);
});

test("round-trips empty string", () => {
  assertEq(decryptString(encryptString("", ENC_SECRET), ENC_SECRET), "");
});

test("two ciphertexts for the same plaintext differ (random IV)", () => {
  const a = encryptString("same", ENC_SECRET);
  const b = encryptString("same", ENC_SECRET);
  assert(a !== b, "ciphertexts should differ — fresh IV per call");
});

test("wrong key fails to decrypt", () => {
  const ct = encryptString("secret", ENC_SECRET);
  let threw = false;
  try { decryptString(ct, "different-secret-of-adequate-len"); } catch { threw = true; }
  assert(threw);
});

test("tampered ciphertext fails GCM auth", () => {
  const ct = encryptString("secret", ENC_SECRET);
  const parts = ct.split(".");
  const raw = Buffer.from(parts[3], "base64");
  raw[0] ^= 0xff;
  const tampered = [parts[0], parts[1], parts[2], raw.toString("base64")].join(".");
  let threw = false;
  try { decryptString(tampered, ENC_SECRET); } catch { threw = true; }
  assert(threw, "tampered ciphertext must not decrypt");
});

test("malformed payload → throws", () => {
  let threw = false;
  try { decryptString("not.valid", ENC_SECRET); } catch { threw = true; }
  assert(threw);
});

test("unsupported version → throws", () => {
  let threw = false;
  try { decryptString("v99.a.b.c", ENC_SECRET); } catch { threw = true; }
  assert(threw);
});

// ── masking ─────────────────────────────────────────────────────

console.log("\nmaskPan / maskAadhaar / last4:");

test("maskPan happy path", () => {
  assertEq(maskPan("abcde1234f"), "ABCDE****F");
});
test("maskPan wrong length", () => {
  assertEq(maskPan("short"), "XXXXX****X");
});
test("maskAadhaar with spaces", () => {
  assertEq(maskAadhaar("1234 5678 9012"), "XXXX-XXXX-9012");
});
test("maskAadhaar too short", () => {
  assertEq(maskAadhaar("12"), "XXXX-XXXX-XXXX");
});
test("last4 strips spaces", () => {
  assertEq(last4("1234 5678 9012"), "9012");
});

// ── rate limit ──────────────────────────────────────────────────

console.log("\nhitRateLimit:");

test("allows within limit", () => {
  const k = "test_bucket_" + Math.random();
  for (let i = 0; i < 3; i++) {
    assert(hitRateLimit(k, 3, 60_000).allowed, `hit ${i} should be allowed`);
  }
});

test("rejects past limit", () => {
  const k = "test_bucket_" + Math.random();
  for (let i = 0; i < 3; i++) hitRateLimit(k, 3, 60_000);
  const r = hitRateLimit(k, 3, 60_000);
  assertEq(r.allowed, false);
});

test("dry run does not increment", () => {
  const k = "test_bucket_" + Math.random();
  hitRateLimit(k, 2, 60_000);
  hitRateLimit(k, 2, 60_000, true); // dry
  hitRateLimit(k, 2, 60_000, true);
  hitRateLimit(k, 2, 60_000, true);
  const r = hitRateLimit(k, 2, 60_000);
  assert(r.allowed, "dry runs should not count toward limit");
});

test("window resets after elapsed time", () => {
  const k = "test_bucket_" + Math.random();
  // Manually set an old window to simulate elapsed time
  rlStore.set(k, { count: 99, windowStart: Date.now() - 10 * 60_000 });
  const r = hitRateLimit(k, 3, 60_000);
  assert(r.allowed, "new window should reset count");
});

// ── summary ─────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
