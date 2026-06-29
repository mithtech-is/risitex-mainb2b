// Pure-function tests for the Medusa calcula module's loop-breaker and
// snapshot extraction helpers. Copy-pasted from:
//   - backend/src/modules/calcula/index.ts#isLoopEchoPush
//   - backend/src/modules/calcula/index.ts#extractLatestPriceFromSnapshot
//
// Run with:  node backend/tests/sync-helpers.test.mjs
//
// These are the subtlest bits of the sync pipeline (see integrations.md
// §6 for why) and the ones whose regressions historically caused silent
// data loss. Kept as pure standalone tests so we can sanity-check them
// without a test framework.

// ── Implementations under test ─────────────────────────────────

function extractLatestPriceFromSnapshot(snap) {
  const arr = snap?.prices;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const last = arr[arr.length - 1];
  if (!Array.isArray(last) || last.length < 2) return null;
  const p = Number(last[1]);
  return Number.isFinite(p) ? p : null;
}

function isLoopEchoPush(map, isin, outgoingPrice) {
  if (!map) return false;
  const last = map.get(isin);
  if (typeof last !== 'number') return false;
  return Math.abs(last - outgoingPrice) < 1e-9;
}

// ── Test harness ───────────────────────────────────────────────

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
function assertEq(a, b, msg) {
  if (a !== b && JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg ?? ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

// ── extractLatestPriceFromSnapshot() ───────────────────────────

console.log('extractLatestPriceFromSnapshot():');

test('null snapshot → null', () => {
  assertEq(extractLatestPriceFromSnapshot(null), null);
});

test('undefined snapshot → null', () => {
  assertEq(extractLatestPriceFromSnapshot(undefined), null);
});

test('empty prices array → null', () => {
  assertEq(extractLatestPriceFromSnapshot({ prices: [] }), null);
});

test('missing prices field → null', () => {
  assertEq(extractLatestPriceFromSnapshot({ events: [] }), null);
});

test('single price point', () => {
  assertEq(extractLatestPriceFromSnapshot({ prices: [[1000, 42]] }), 42);
});

test('multiple points: returns the LAST tuple value', () => {
  const snap = {
    prices: [
      [1000, 10],
      [2000, 20],
      [3000, 99.99],
    ],
  };
  assertEq(extractLatestPriceFromSnapshot(snap), 99.99);
});

test('malformed last tuple → null', () => {
  assertEq(extractLatestPriceFromSnapshot({ prices: [[1000, 10], [2000]] }), null);
  assertEq(extractLatestPriceFromSnapshot({ prices: [[1000, 'nope']] }), null);
});

test('price as string → coerced via Number()', () => {
  assertEq(extractLatestPriceFromSnapshot({ prices: [[1000, '42.5']] }), 42.5);
});

test('NaN price → null', () => {
  assertEq(extractLatestPriceFromSnapshot({ prices: [[1000, NaN]] }), null);
});

// ── isLoopEchoPush() ───────────────────────────────────────────

console.log('\nisLoopEchoPush():');

test('no map → false (no echo state yet)', () => {
  assertEq(isLoopEchoPush(undefined, 'INE0DJ201029', 100), false);
});

test('map empty → false', () => {
  assertEq(isLoopEchoPush(new Map(), 'INE0DJ201029', 100), false);
});

test('different ISIN → false (not our price)', () => {
  const map = new Map([['OTHER', 100]]);
  assertEq(isLoopEchoPush(map, 'INE0DJ201029', 100), false);
});

test('same ISIN + same price → true (echo)', () => {
  const map = new Map([['INE0DJ201029', 100]]);
  assertEq(isLoopEchoPush(map, 'INE0DJ201029', 100), true);
});

test('same ISIN + floating-point near-match → true (tolerant)', () => {
  const map = new Map([['INE0DJ201029', 100.1 + 0.2]]); // 100.30000000000001
  assertEq(isLoopEchoPush(map, 'INE0DJ201029', 100.3), true);
});

test('same ISIN + clearly different value → false (push allowed)', () => {
  const map = new Map([['INE0DJ201029', 100]]);
  assertEq(isLoopEchoPush(map, 'INE0DJ201029', 101), false);
});

test('map value is non-number → false (stale / corrupt)', () => {
  const map = new Map([['INE0DJ201029', 'x']]);
  assertEq(isLoopEchoPush(map, 'INE0DJ201029', 100), false);
});

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
