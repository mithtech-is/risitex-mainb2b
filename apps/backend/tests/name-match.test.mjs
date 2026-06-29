// Pure-function tests for the KYC name-match logic. Copy-pasted from:
//   - backend/src/modules/cashfree_wallet/cashfree/secure-id.ts#normaliseNameTokens
//   - backend/src/modules/cashfree_wallet/cashfree/secure-id.ts#gradeNameMatch
//   - backend/src/modules/cashfree_wallet/cashfree/secure-id.ts#gradeNameMatchCrossDoc
//   - backend/src/api/store/bank-accounts/route.ts#decideVerificationStatus
//
// Run with:  node apps/medusa-backend/tests/name-match.test.mjs
//
// Why this exists
// ---------------
// Real-world bank / Aadhaar / PAN data carries honorifics ("Mr.",
// "Smt."), double-spaces from branch data-entry artifacts, mixed casing,
// and asymmetric token counts (PAN vs Aadhaar). One of these — "Mr.
// Soubarna  Karmakar" returned by SBI's BAV — slipped a legitimate match
// down to 0.67 → name_mismatch verdict, with the customer locked out of
// linking her own bank. The honorific stripping fix shipped 2026-05-08
// closes that hole; this file is the regression net so the same class
// of bug doesn't sneak back in.
//
// Coverage:
//   - Honorific stripping (English + Indian variants)
//   - Initial expansion ("M" matches "MITHAJAL")
//   - Real-world bank format (double-space, "Mr.", mixed case)
//   - Cross-doc strictness vs single-doc strictness
//   - Verdict logic for live-Cashfree path AND cache-replay path
//   - False-positive guards (different people don't pass)

// ── Implementations under test ─────────────────────────────────

const HONORIFIC_TOKENS = new Set([
  "MR",
  "MRS",
  "MS",
  "MISS",
  "MASTER",
  "DR",
  "PROF",
  "SHRI",
  "SHREE",
  "SRI",
  "SMT",
  "SH",
  "SRIMATI",
]);

function normaliseNameTokens(s) {
  // Initials are kept here so the matching layer can expand them
  // (M → MITHAJAL). Anti-bare-initials guard lives in the matcher.
  return s
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !HONORIFIC_TOKENS.has(t));
}

function countSharedWithInitialExpansion(setA, setB) {
  // Pass 1: only multi-letter exact matches count.
  const remainingB = new Set(setB);
  const remainingA = [];
  let multiLetterShared = 0;
  for (const t of setA) {
    const taIsInitial = t.length === 1;
    if (!taIsInitial && remainingB.has(t)) {
      multiLetterShared++;
      remainingB.delete(t);
    } else {
      remainingA.push(t);
    }
  }
  let shared = multiLetterShared;
  let initialMatchUsed = false;
  // Pass 2 (anti-bare-initials guard): only run if pass 1 anchored
  // at least one multi-letter shared token. Prevents "M K" alone
  // from falsely matching "MANOJ KUMAR".
  if (multiLetterShared >= 1) {
    for (const ta of [...remainingA]) {
      for (const tb of remainingB) {
        const taIsInitial = ta.length === 1;
        const tbIsInitial = tb.length === 1;
        const initialMatch =
          (taIsInitial && !tbIsInitial && tb[0] === ta) ||
          (tbIsInitial && !taIsInitial && ta[0] === tb);
        if (initialMatch) {
          shared++;
          initialMatchUsed = true;
          remainingB.delete(tb);
          const idx = remainingA.indexOf(ta);
          if (idx !== -1) remainingA.splice(idx, 1);
          break;
        }
      }
    }
  }
  return { shared, initialMatchUsed };
}

function gradeNameMatch(submitted, registered) {
  const a = normaliseNameTokens(submitted);
  const b = normaliseNameTokens(registered);
  if (a.length === 0 || b.length === 0) {
    return { grade: "NO_MATCH", score: 0 };
  }
  const setA = new Set(a);
  const setB = new Set(b);
  const { shared } = countSharedWithInitialExpansion(setA, setB);
  const denom = Math.max(setA.size, setB.size);
  const score = denom === 0 ? 0 : shared / denom;
  const rounded = Math.round(score * 100) / 100;
  let grade;
  if (rounded >= 0.95) grade = "EXACT_MATCH";
  else if (rounded >= 0.85) grade = "GOOD_PARTIAL_MATCH";
  else if (rounded >= 0.6) grade = "MODERATE_PARTIAL_MATCH";
  else if (rounded >= 0.3) grade = "POOR_PARTIAL_MATCH";
  else grade = "NO_MATCH";
  return { grade, score: rounded };
}

function gradeNameMatchCrossDoc(a, b) {
  const tokensA = normaliseNameTokens(a);
  const tokensB = normaliseNameTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) {
    return { grade: "NO_MATCH", score: 0 };
  }
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const { shared } = countSharedWithInitialExpansion(setA, setB);
  // gradeNameMatchCrossDoc uses min(setA, setB) when BOTH sides have ≥2
  // tokens, otherwise falls back to max.
  const denom =
    setA.size >= 2 && setB.size >= 2
      ? Math.min(setA.size, setB.size)
      : Math.max(setA.size, setB.size);
  const score = denom === 0 ? 0 : shared / denom;
  const rounded = Math.round(score * 100) / 100;
  let grade;
  if (rounded >= 0.95) grade = "EXACT_MATCH";
  else if (rounded >= 0.85) grade = "GOOD_PARTIAL_MATCH";
  else if (rounded >= 0.6) grade = "MODERATE_PARTIAL_MATCH";
  else if (rounded >= 0.3) grade = "POOR_PARTIAL_MATCH";
  else grade = "NO_MATCH";
  return { grade, score: rounded };
}

// Bank-route verdict logic — copy of `decideVerificationStatus` from
// /store/bank-accounts/route.ts. Pulled out as a pure function so the
// branching matrix (live vs cache, both signals vs one signal, score
// floors) can be exhaustively tested.
const AUTO_PASS_SCORE = 0.85;
const MANUAL_REVIEW_FLOOR = 0.6;

function decideVerificationStatus({
  pennyOk,
  cachedMatch,
  nameMatchResult, // "DIRECT_MATCH" | "NO_MATCH" | undefined
  cashfreeScoreNormalised, // null | number in [0,1]
  localCrossScore, // null | number in [0,1]
}) {
  if (!pennyOk) return "failed";
  if (nameMatchResult === "NO_MATCH") return "failed";
  if (
    (cashfreeScoreNormalised != null &&
      cashfreeScoreNormalised < MANUAL_REVIEW_FLOOR) ||
    (localCrossScore != null && localCrossScore < MANUAL_REVIEW_FLOOR)
  ) {
    return "failed";
  }
  if (cachedMatch) {
    const localOk =
      localCrossScore == null || localCrossScore >= MANUAL_REVIEW_FLOOR;
    return localOk ? "verified" : "name_mismatch";
  }
  const cashfreePass =
    cashfreeScoreNormalised == null ||
    cashfreeScoreNormalised >= AUTO_PASS_SCORE;
  const localPass =
    localCrossScore == null || localCrossScore >= AUTO_PASS_SCORE;
  if (cashfreePass && localPass) return "verified";
  return "name_mismatch";
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
    console.log(`     ${e.message}`);
    failed++;
  }
}
function assertEq(actual, expected, msg = "") {
  if (actual !== expected) {
    throw new Error(
      `${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    );
  }
}
function assertGte(actual, threshold, msg = "") {
  if (!(actual >= threshold)) {
    throw new Error(
      `${msg}\n  expected: >= ${threshold}\n  actual:   ${actual}`,
    );
  }
}
function assertLte(actual, threshold, msg = "") {
  if (!(actual <= threshold)) {
    throw new Error(
      `${msg}\n  expected: <= ${threshold}\n  actual:   ${actual}`,
    );
  }
}

// ── Honorific stripping ────────────────────────────────────────
console.log("\nHonorific stripping (the bug that triggered this file):");

test("'Mr.' prefix on bank name does not penalise legit match", () => {
  // The exact regression case: SBI returned "Mr. Soubarna  Karmakar"
  // (note double space — a real branch data-entry artifact). PAN is
  // the all-caps formal "SOUBARNA KARMAKAR". Pre-fix this scored 0.67
  // (MODERATE) and routed to name_mismatch.
  const r = gradeNameMatch("SOUBARNA KARMAKAR", "Mr. Soubarna  Karmakar");
  assertEq(r.score, 1.0, "expected exact match after honorific strip");
  assertEq(r.grade, "EXACT_MATCH");
});

test("'Mrs.' on registered women's accounts", () => {
  const r = gradeNameMatch("JANE DOE", "Mrs. Jane Doe");
  assertEq(r.score, 1.0);
  assertEq(r.grade, "EXACT_MATCH");
});

test("'Smt.' (Hindi feminine honorific) is stripped", () => {
  const r = gradeNameMatch("ASHA RANI", "Smt. Asha Rani");
  assertEq(r.score, 1.0);
  assertEq(r.grade, "EXACT_MATCH");
});

test("'Shri' (Hindi masculine honorific) is stripped", () => {
  const r = gradeNameMatch("RAVI VERMA", "Shri Ravi Verma");
  assertEq(r.score, 1.0);
});

test("'Sri' (alternate Hindi spelling) is stripped", () => {
  const r = gradeNameMatch("KIRAN KUMAR", "Sri Kiran Kumar");
  assertEq(r.score, 1.0);
});

test("'Dr.' professional honorific is stripped", () => {
  const r = gradeNameMatch("PRIYA SHARMA", "Dr. Priya Sharma");
  assertEq(r.score, 1.0);
});

test("'Master' (used for minors / sometimes adults) is stripped", () => {
  const r = gradeNameMatch("ARJUN PATEL", "Master Arjun Patel");
  assertEq(r.score, 1.0);
});

test("'Miss' is stripped", () => {
  const r = gradeNameMatch("DIVYA RAO", "Miss Divya Rao");
  assertEq(r.score, 1.0);
});

test("multiple honorifics layered (Dr. Mr.) all stripped", () => {
  // Some hospital / institution accounts carry both. Should still resolve.
  const r = gradeNameMatch("VIKRAM SINGH", "Dr. Mr. Vikram Singh");
  assertEq(r.score, 1.0);
});

// ── Real-world data quirks ─────────────────────────────────────
console.log("\nReal-world data quirks (bank / Aadhaar / PAN formatting):");

test("double-space between tokens does not break tokenisation", () => {
  // SBI's actual data: "Mr. Soubarna  Karmakar" has a stray double
  // space where a middle name slot was empty. The split regex
  // /\s+/ collapses any run of whitespace to a single delimiter.
  const r = gradeNameMatch("Soubarna Karmakar", "Soubarna  Karmakar");
  assertEq(r.score, 1.0, "double space must not produce empty tokens");
});

test("mixed casing (bank vs PAN) handled by uppercase pass", () => {
  // PAN: ALL CAPS. HDFC: title case. Different bank systems vary.
  const r = gradeNameMatch("MANOJ BHAT", "Manoj Bhat");
  assertEq(r.score, 1.0);
});

test("trailing punctuation on registered name is normalised away", () => {
  const r = gradeNameMatch("ASHA RANI", "ASHA RANI.");
  assertEq(r.score, 1.0);
});

test("dot-separated initials ('R.K. SHARMA' style) bridge to full names", () => {
  // Pass 1: SHARMA matches SHARMA (multi-letter anchor). Pass 2
  // expansion: R→RAKESH, K→KUMAR. shared=3, denom=max(3,3)=3.
  const r = gradeNameMatch("R.K. SHARMA", "RAKESH KUMAR SHARMA");
  assertEq(r.score, 1.0, "initial expansion bridges dot-separated initials");
  assertEq(r.grade, "EXACT_MATCH");
});

test("middle name initial vs PAN's full form (Manoj M Bhat)", () => {
  // The canonical case from the function's docstring. Pass 1 anchors
  // on MANOJ + BHAT. Pass 2: M → MITHAJAL via initial expansion.
  // shared=3, denom=3, score=1.0.
  const r = gradeNameMatch("Manoj M Bhat", "Manoj Mithajal Bhat");
  assertEq(r.score, 1.0, "M -> Mithajal expansion gives exact-match score");
  assertEq(r.grade, "EXACT_MATCH");
});

test("'Manoj M Bhat' vs 'Mr Manoj Mithajal Bhat' (the question that prompted this)", () => {
  // Combines BOTH fixes: honorific stripping (Mr) AND initial
  // expansion (M → Mithajal). Without either one, this case would
  // score below AUTO_PASS_SCORE.
  const r = gradeNameMatch("Manoj M Bhat", "Mr Manoj Mithajal Bhat");
  assertEq(r.score, 1.0, "honorific + initial expansion compose correctly");
  assertEq(r.grade, "EXACT_MATCH");
});

// ── False-positive guards ──────────────────────────────────────
console.log("\nFalse-positive guards (different people must NOT pass):");

test("entirely different person scores POOR / NO_MATCH", () => {
  const r = gradeNameMatch("DIFF PERSON", "SOME OTHER NAME");
  assertLte(r.score, 0.3);
});

test("attacker with single overlapping token cannot pass", () => {
  // Pre-2026-05-05 bug closure: "JOHN" vs "JOHN SMITH KUMAR" was
  // GOOD_PARTIAL_MATCH (subset rule). Now must be POOR.
  const r = gradeNameMatch("JOHN", "JOHN SMITH KUMAR PATEL");
  assertLte(r.score, 0.3, "single-token subset must not auto-pass");
});

test("honorific-only string cannot match anyone", () => {
  // "Mr." with no actual name → all tokens stripped → zero tokens → NO_MATCH.
  const r = gradeNameMatch("Mr.", "RAVI VERMA");
  assertEq(r.score, 0);
  assertEq(r.grade, "NO_MATCH");
});

test("honorifics on BOTH sides (different people) still score correctly", () => {
  // Stripping must not produce false positives by deleting too much.
  const r = gradeNameMatch("Mr. Ravi Kumar", "Mr. Anil Sharma");
  assertLte(r.score, 0.3);
});

test("ANTI-BARE-INITIALS GUARD: 'M K' alone cannot match 'MANOJ KUMAR'", () => {
  // The security floor that protects initial-to-full expansion. If
  // pass 1 produces zero multi-letter exact matches, pass 2 is
  // SKIPPED — initials never count standalone. Without this guard,
  // an attacker could brute-force the 26² space of initial pairs.
  const r = gradeNameMatch("M K", "MANOJ KUMAR");
  assertEq(r.score, 0, "bare initials must not match — anti-bare-initials guard");
  assertEq(r.grade, "NO_MATCH");
});

test("ANTI-BARE-INITIALS GUARD: 'A B C D' (4 initials) vs 4-name target → 0", () => {
  // Same guard, larger surface. Even with a "matching" first letter
  // count, no expansions happen because pass 1 anchored zero shared.
  const r = gradeNameMatch("A B C D", "ANIL BHARAT CHANDRA DAS");
  assertEq(r.score, 0);
});

test("ANTI-BARE-INITIALS GUARD: cross-doc also enforces (no relaxation here)", () => {
  // gradeNameMatchCrossDoc shares the guard via the same matcher.
  const r = gradeNameMatchCrossDoc("M K", "MANOJ KUMAR");
  assertEq(r.score, 0);
});

test("anchor exists: 'M Bhat' vs 'Mithajal Bhat' (1 multi anchor + 1 expansion)", () => {
  // Pass 1: BHAT match (multi anchor). Pass 2: M → MITHAJAL.
  // shared=2, denom=max(2, 2)=2, score=1.0.
  const r = gradeNameMatch("M Bhat", "Mithajal Bhat");
  assertEq(r.score, 1.0);
});

// ── Cross-doc strictness ───────────────────────────────────────
console.log("\nCross-doc grading (PAN vs Aadhaar — looser denominator):");

test("PAN vs Aadhaar abbreviated form bridges via min-denom + expansion", () => {
  // PAN: "MANOJ MITHAJAL BHAT" (ITD formal, 3 tokens). Aadhaar:
  // "MANOJ M" (UIDAI abbreviated, 2 tokens). Both sides have ≥2
  // tokens → cross-doc uses min-denom (2). Pass 1 anchors on MANOJ.
  // Pass 2: M → MITHAJAL. shared=2 / 2 = 1.0.
  const r = gradeNameMatchCrossDoc("MANOJ MITHAJAL BHAT", "MANOJ M");
  assertEq(r.score, 1.0, "cross-doc abbreviation should score EXACT");
  assertEq(r.grade, "EXACT_MATCH");
});

test("cross-doc keeps single-token ⊂ multi-token rejection (no relaxation)", () => {
  // The ≥2-token floor on min-denom: "AYUSH" (1 token) vs "AYUSH KUMAR
  // PATEL" (3 tokens) falls back to strict max-denom = 1/3 = 0.33.
  // Without the floor this would falsely pass at 1.0.
  const r = gradeNameMatchCrossDoc("AYUSH", "AYUSH KUMAR PATEL");
  assertLte(r.score, 0.4, "single-token cross-doc must not auto-pass");
});

// ── Verdict logic (bank-accounts route) ────────────────────────
console.log("\nBank verdict logic (live Cashfree path):");

test("live: both signals pass AUTO_PASS_SCORE → verified", () => {
  const v = decideVerificationStatus({
    pennyOk: true,
    cachedMatch: false,
    nameMatchResult: "DIRECT_MATCH",
    cashfreeScoreNormalised: 0.95,
    localCrossScore: 0.95,
  });
  assertEq(v, "verified");
});

test("live: Cashfree NO_MATCH → failed regardless of local score", () => {
  const v = decideVerificationStatus({
    pennyOk: true,
    cachedMatch: false,
    nameMatchResult: "NO_MATCH",
    cashfreeScoreNormalised: 0.95,
    localCrossScore: 0.95,
  });
  assertEq(v, "failed");
});

test("live: either signal below MANUAL_REVIEW_FLOOR → failed", () => {
  const v = decideVerificationStatus({
    pennyOk: true,
    cachedMatch: false,
    nameMatchResult: "DIRECT_MATCH",
    cashfreeScoreNormalised: 0.5,
    localCrossScore: 0.95,
  });
  assertEq(v, "failed");
});

test("live: Cashfree pass + local in 0.6-0.85 band → name_mismatch", () => {
  const v = decideVerificationStatus({
    pennyOk: true,
    cachedMatch: false,
    nameMatchResult: "DIRECT_MATCH",
    cashfreeScoreNormalised: 0.9,
    localCrossScore: 0.7,
  });
  assertEq(v, "name_mismatch");
});

test("live: penny-drop failed → failed", () => {
  const v = decideVerificationStatus({
    pennyOk: false,
    cachedMatch: false,
    nameMatchResult: "DIRECT_MATCH",
    cashfreeScoreNormalised: 0.95,
    localCrossScore: 0.95,
  });
  assertEq(v, "failed");
});

console.log("\nBank verdict logic (cache-replay path):");

test("cache: local score MODERATE (0.7) → verified (not name_mismatch)", () => {
  // The fix that ships with this test file: cache-replay relaxation.
  // Cashfree already cleared this fingerprint server-side; we only
  // need MODERATE local overlap, not full 0.85 AUTO_PASS_SCORE.
  const v = decideVerificationStatus({
    pennyOk: true,
    cachedMatch: true,
    nameMatchResult: undefined, // typical of cached row (NULL in DB)
    cashfreeScoreNormalised: null,
    localCrossScore: 0.7,
  });
  assertEq(v, "verified");
});

test("cache: local score below MANUAL_REVIEW_FLOOR → failed", () => {
  // Even on cache replay, low local score → fail. We don't blindly
  // trust the cache — local sanity check still gates.
  const v = decideVerificationStatus({
    pennyOk: true,
    cachedMatch: true,
    nameMatchResult: undefined,
    cashfreeScoreNormalised: null,
    localCrossScore: 0.4,
  });
  assertEq(v, "failed");
});

test("cache: local score in [0.6, 0.85) → verified (the regression fix)", () => {
  // The exact bug Soubarna hit: pre-fix this returned name_mismatch.
  const v = decideVerificationStatus({
    pennyOk: true,
    cachedMatch: true,
    nameMatchResult: undefined,
    cashfreeScoreNormalised: null,
    localCrossScore: 0.67, // "Mr. Soubarna" vs "SOUBARNA KARMAKAR" pre-honorific-strip
  });
  assertEq(v, "verified", "cache-replay must trust prior Cashfree VALID");
});

test("cache: local score null (no name_at_bank in cache) → verified", () => {
  // Defensive: if the cached row has no name_at_bank, local match is
  // null → trust the cache (Cashfree already said VALID).
  const v = decideVerificationStatus({
    pennyOk: true,
    cachedMatch: true,
    nameMatchResult: undefined,
    cashfreeScoreNormalised: null,
    localCrossScore: null,
  });
  assertEq(v, "verified");
});

test("cache: penny_ok=false (impossible but defensive) → failed", () => {
  const v = decideVerificationStatus({
    pennyOk: false,
    cachedMatch: true,
    nameMatchResult: undefined,
    cashfreeScoreNormalised: null,
    localCrossScore: 0.95,
  });
  assertEq(v, "failed");
});

// ── Tokenisation edge cases ────────────────────────────────────
console.log("\nTokenisation edge cases:");

test("empty string → empty token array", () => {
  const tokens = normaliseNameTokens("");
  assertEq(tokens.length, 0);
});

test("only punctuation → empty token array", () => {
  const tokens = normaliseNameTokens("...---...");
  assertEq(tokens.length, 0);
});

test("only honorifics → empty token array", () => {
  const tokens = normaliseNameTokens("Mr. Mrs. Dr.");
  assertEq(tokens.length, 0);
});

test("single-letter tokens (initials) preserved for expansion", () => {
  // Post-2026-05-08: initials are kept at the tokenisation layer so
  // gradeNameMatch's pass 2 can expand them. The matcher's
  // anti-bare-initials guard prevents standalone-initial false
  // positives — see the 'M K' vs 'MANOJ KUMAR' guard test above.
  const tokens = normaliseNameTokens("M K B");
  assertEq(tokens.length, 3);
  assertEq(tokens[0], "M");
});

test("mixed: honorific stripped, initial preserved, name preserved", () => {
  const tokens = normaliseNameTokens("Mr. M Sharma");
  assertEq(tokens.length, 2);
  assertEq(tokens[0], "M");
  assertEq(tokens[1], "SHARMA");
});

test("non-ASCII characters become whitespace and split tokens", () => {
  // Some banks return names with stray Unicode (zero-width spaces,
  // non-breaking spaces). The [^A-Z\s] strip handles ASCII; non-ASCII
  // letters become space → tokens still separate correctly.
  const tokens = normaliseNameTokens("RAVI KUMAR"); // non-breaking space
  //   is not in A-Z + \s — but \s in JS includes  , so it's
  // fine. If a future engine quirk breaks this we want to know.
  assertEq(tokens.length, 2);
  assertEq(tokens[0], "RAVI");
});

// ── Summary ────────────────────────────────────────────────────
console.log("");
if (failed > 0) {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
} else {
  console.log(`${passed} passed, 0 failed`);
}
