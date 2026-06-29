// Pure-function tests for the response-envelope helpers added in
// Phase 5 of the architecture refactor. Live counterparts:
//   - apps/medusa-backend/src/utils/envelope.ts (respondOk + respondErr)
//   - packages/api-contracts/src/envelope.ts (Envelope<T> shape)
//
// These tests duplicate the behaviour inline (same convention as the
// other framework-free tests in this directory) so they run with plain
// `node`, no Medusa framework boot, no zod install. The contract being
// tested is structural — does the envelope shape fall through cleanly?
//
// Run:  node apps/medusa-backend/tests/envelope-conformance.test.mjs

// ── Implementations under test (copied verbatim) ────────────────

/** Mirrors apps/medusa-backend/src/utils/envelope.ts */
function makeRes() {
    // Minimal MedusaResponse stub — captures status + json body so the
    // test can introspect what would have been written to the wire.
    const captured = { status: 200, body: undefined }
    const res = {
        status(code) {
            captured.status = code
            return res
        },
        json(body) {
            captured.body = body
            return res
        },
        _captured: captured,
    }
    return res
}

function respondOk(res, data, status = 200) {
    return res.status(status).json({ ok: true, data })
}

function respondErr(res, status, code, message, details) {
    const body = { ok: false, code, message }
    if (details) body.details = details
    return res.status(status).json(body)
}

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

function eq(actual, expected, message) {
    const a = JSON.stringify(actual)
    const e = JSON.stringify(expected)
    if (a !== e) {
        throw new Error(`${message ?? ""} expected ${e} got ${a}`)
    }
}

// ── Tests ──────────────────────────────────────────────────────

describe("respondOk", () => {
    it("default status 200 with { ok:true, data }", () => {
        const res = makeRes()
        respondOk(res, { verified: true, name: "RAJESH" })
        eq(res._captured.status, 200, "status")
        eq(res._captured.body, { ok: true, data: { verified: true, name: "RAJESH" } })
    })

    it("custom status (201) preserves envelope", () => {
        const res = makeRes()
        respondOk(res, { id: "x" }, 201)
        eq(res._captured.status, 201)
        eq(res._captured.body, { ok: true, data: { id: "x" } })
    })

    it("primitive data wraps under .data", () => {
        const res = makeRes()
        respondOk(res, "ok")
        eq(res._captured.body, { ok: true, data: "ok" })
    })

    it("null data wraps under .data (legitimate empty success)", () => {
        const res = makeRes()
        respondOk(res, null)
        eq(res._captured.body, { ok: true, data: null })
    })

    it("array data wraps under .data without flattening", () => {
        const res = makeRes()
        respondOk(res, [1, 2, 3])
        eq(res._captured.body, { ok: true, data: [1, 2, 3] })
    })

    it("does not leak top-level keys other than ok/data", () => {
        const res = makeRes()
        respondOk(res, { ok: false, sneaky: 1 })
        // Top-level ok MUST be true (envelope); user's `ok:false`
        // inside data is preserved verbatim under .data.
        eq(res._captured.body.ok, true)
        eq(res._captured.body.data, { ok: false, sneaky: 1 })
        eq(Object.keys(res._captured.body).sort(), ["data", "ok"])
    })
})

describe("respondErr", () => {
    it("emits { ok:false, code, message } at the supplied status", () => {
        const res = makeRes()
        respondErr(res, 400, "kyc.pan.format_invalid", "Invalid PAN format")
        eq(res._captured.status, 400)
        eq(res._captured.body, {
            ok: false,
            code: "kyc.pan.format_invalid",
            message: "Invalid PAN format",
        })
    })

    it("includes details when provided", () => {
        const res = makeRes()
        respondErr(res, 429, "auth.email_otp.rate_limit_hour", "Too many", {
            reset_at: "2026-04-30T12:00:00Z",
        })
        eq(res._captured.body, {
            ok: false,
            code: "auth.email_otp.rate_limit_hour",
            message: "Too many",
            details: { reset_at: "2026-04-30T12:00:00Z" },
        })
    })

    it("omits details when undefined (no empty object)", () => {
        const res = makeRes()
        respondErr(res, 401, "auth.unauthenticated", "Not authenticated")
        const body = res._captured.body
        if ("details" in body) {
            throw new Error(`details should be omitted, got ${JSON.stringify(body)}`)
        }
    })

    it("does NOT swallow falsy 5xx status", () => {
        const res = makeRes()
        respondErr(res, 500, "auth.email_otp.update_failed", "boom")
        eq(res._captured.status, 500)
    })

    it("preserves arbitrary detail key names", () => {
        const res = makeRes()
        respondErr(res, 400, "auth.phone_otp.wrong_otp", "wrong", {
            remaining_attempts: 2,
        })
        eq(res._captured.body.details, { remaining_attempts: 2 })
    })
})

describe("envelope shape invariants", () => {
    it("ok envelope has exactly 2 keys (ok + data)", () => {
        const res = makeRes()
        respondOk(res, { x: 1 })
        eq(Object.keys(res._captured.body).sort(), ["data", "ok"])
    })

    it("err envelope without details has exactly 3 keys", () => {
        const res = makeRes()
        respondErr(res, 400, "x.y", "z")
        eq(Object.keys(res._captured.body).sort(), ["code", "message", "ok"])
    })

    it("err envelope with details has exactly 4 keys", () => {
        const res = makeRes()
        respondErr(res, 400, "x.y", "z", { a: 1 })
        eq(Object.keys(res._captured.body).sort(), [
            "code",
            "details",
            "message",
            "ok",
        ])
    })

    it("ok envelope's ok flag is literal true (not truthy)", () => {
        const res = makeRes()
        respondOk(res, {})
        if (res._captured.body.ok !== true) {
            throw new Error("ok must be literal true")
        }
    })

    it("err envelope's ok flag is literal false (not falsy)", () => {
        const res = makeRes()
        respondErr(res, 400, "x", "y")
        if (res._captured.body.ok !== false) {
            throw new Error("ok must be literal false")
        }
    })
})

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${passCount} passed, ${failCount} failed`)
if (failCount > 0) process.exit(1)
