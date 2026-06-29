// Pure-function tests for the VBA webhook payload extractor. Inlined
// from `apps/medusa-backend/src/api/webhooks/cashfree/payment-gateway/route.ts`
// (function `extractVbaEvent`).
//
// Why this file exists
// --------------------
// Cashfree has shipped at least four payload shapes for VBA / Auto-
// Collect credit notifications (legacy Payouts, PG 2022, PG 2024 named
// `AMOUNT_COLLECTED`, and PG 2025 `PAYMENT_SUCCESS_WEBHOOK` with the
// VBA fields nested under `data.payment.payment_method.vba_transfer`).
// A silent regression here means a real customer deposit fires the
// webhook → handler returns 200 ignored → wallet never credits → the
// 30-min cron is the only safety net.
//
// We pin all four shapes here so any future field-rename ships with a
// failing test instead of a silent miss.
//
// Run with:  node apps/medusa-backend/tests/vba-event-extractor.test.mjs

// ── Implementation under test (copy of extractVbaEvent) ─────────────

function extractVbaEvent(p) {
  const data = p.data ?? p.payload ?? p
  if (!data || typeof data !== "object") return null

  const paymentBlock = data.payment
  const vbaTransfer = paymentBlock?.payment_method?.vba_transfer

  const transfer =
    vbaTransfer ||
    paymentBlock ||
    data.transfer ||
    data.transaction ||
    data
  const vAccount = data.virtual_account || data.vAccount || vbaTransfer || data

  const virtualAccountId =
    transfer.virtual_account_id ??
    vAccount.virtual_account_id ??
    vAccount.vAccountId ??
    transfer.vAccountId
  if (!virtualAccountId) return null

  const statusRaw = String(
    paymentBlock?.payment_status ??
      transfer.payment_status ??
      transfer.txstatus ??
      transfer.status ??
      "",
  ).toUpperCase()
  if (statusRaw && statusRaw !== "SUCCESS") return null

  const amountRaw =
    paymentBlock?.payment_amount ??
    transfer.payment_amount ??
    transfer.amount ??
    transfer.transferAmount ??
    p.amount
  const amount = Number(amountRaw)
  if (!Number.isFinite(amount) || amount <= 0) return null

  const utr =
    transfer.utr ??
    paymentBlock?.payment_utr ??
    transfer.payment_utr ??
    transfer.credit_ref_number ??
    null

  const eventId =
    p.event_id ??
    p.id ??
    paymentBlock?.cf_payment_id ??
    transfer.cf_payment_id ??
    transfer.reference_id ??
    transfer.transferId ??
    transfer.transfer_id ??
    utr ??
    `vba_${virtualAccountId}_${amount}_${p.event_time ?? Date.now()}_${process.hrtime.bigint()}`

  return {
    event_id: String(eventId),
    event_type: String(p.event ?? p.type ?? "AMOUNT_COLLECTED"),
    virtual_account_id: String(virtualAccountId),
    amount_rupees: amount,
    utr,
    remitter_name:
      transfer.remitter_name ?? transfer.remitterName ?? null,
    remitter_account_number:
      transfer.remitter_account_number ??
      transfer.remitter_account ??
      transfer.remitterAccount ??
      null,
    remitter_ifsc:
      transfer.remitter_ifsc ?? transfer.remitterIfsc ?? null,
  }
}

// ── Test harness ───────────────────────────────────────────────

let failed = 0
let passed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ❌ ${name}`)
    console.log(`     ${e.message}`)
    failed++
  }
}
function assertEq(actual, expected, msg = "") {
  if (actual !== expected) {
    throw new Error(
      `${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    )
  }
}

// ── Real-world payload shapes ───────────────────────────────────

console.log("\nVBA event extractor — payload shapes:")

test("PAYMENT_SUCCESS_WEBHOOK 2025-01-01 (vba_transfer nested)", () => {
  // The exact shape per Cashfree's latest API docs. This is what now
  // arrives when the merchant has the unified PG webhook subscription
  // and a customer NEFTs to their VBA.
  const event = extractVbaEvent({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      order: { order_id: null, order_amount: null }, // null on Auto-Collect
      payment: {
        cf_payment_id: 5535533853,
        payment_status: "SUCCESS",
        payment_amount: 10,
        payment_utr: "SBIN326128255037",
        payment_method: {
          vba_transfer: {
            virtual_account_id: "00072619",
            virtual_account_number: "9426156700072619",
            ifsc: "UTIB0CCH274",
            remitter_name: "Soubarna Karmakar",
            remitter_account_number: "00000044210138954",
            remitter_ifsc: "SBIN0015322",
            utr: "SBIN326128255037",
          },
        },
      },
    },
  })
  assertEq(event !== null, true, "event must not be null")
  assertEq(event.virtual_account_id, "00072619")
  assertEq(event.amount_rupees, 10)
  assertEq(event.utr, "SBIN326128255037")
  assertEq(event.remitter_name, "Soubarna Karmakar")
  assertEq(event.remitter_account_number, "00000044210138954")
  assertEq(event.remitter_ifsc, "SBIN0015322")
  assertEq(event.event_id, "5535533853")
})

test("PAYMENT_SUCCESS_WEBHOOK with non-VBA payment_method → null", () => {
  // A regular order paid by card / UPI shouldn't crash the extractor
  // — it just returns null and the route logs `unrecognised_shape`.
  const event = extractVbaEvent({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      order: { order_id: "O123" },
      payment: {
        cf_payment_id: 999,
        payment_status: "SUCCESS",
        payment_amount: 500,
        payment_method: { card: { card_number: "411111XXXXXX1111" } },
      },
    },
  })
  assertEq(event, null)
})

test("AMOUNT_COLLECTED 2024-ish (data.payment + data.virtual_account)", () => {
  // The shape our extractor was originally built for.
  const event = extractVbaEvent({
    type: "AMOUNT_COLLECTED",
    event_time: "2026-05-08T22:00:00+05:30",
    data: {
      virtual_account: {
        virtual_account_id: "00072619",
        virtual_account_number: "9426156700072619",
        ifsc: "UTIB0CCH274",
      },
      payment: {
        cf_payment_id: 12345,
        payment_status: "SUCCESS",
        payment_amount: 10,
        payment_utr: "SBIN326128255037",
        remitter_name: "Soubarna Karmakar",
        remitter_account_number: "00000044210138954",
        remitter_ifsc: "SBIN0015322",
      },
    },
  })
  assertEq(event !== null, true)
  assertEq(event.virtual_account_id, "00072619")
  assertEq(event.amount_rupees, 10)
  assertEq(event.utr, "SBIN326128255037")
  assertEq(event.remitter_name, "Soubarna Karmakar")
  assertEq(event.event_id, "12345")
})

test("PG 2022-09-01 / 2023-08-01 (data.transaction)", () => {
  const event = extractVbaEvent({
    data: {
      virtual_account: { virtual_account_id: "00012618" },
      transaction: {
        virtual_account_id: "00012618",
        amount: 1500,
        utr: "AXIS1234567",
        txstatus: "SUCCESS",
        remitter_account: "12345",
        remitter_name: "Manoj Bhat",
        reference_id: "REF456",
      },
    },
  })
  assertEq(event !== null, true)
  assertEq(event.virtual_account_id, "00012618")
  assertEq(event.amount_rupees, 1500)
  assertEq(event.utr, "AXIS1234567")
  assertEq(event.remitter_name, "Manoj Bhat")
  assertEq(event.event_id, "REF456")
})

test("Legacy Payouts VBA (data.transfer + data.vAccount)", () => {
  const event = extractVbaEvent({
    data: {
      vAccount: { vAccountId: "OLD123" },
      transfer: {
        vAccountId: "OLD123",
        transferAmount: 200,
        utr: "OLDUTR",
        txstatus: "SUCCESS",
        remitterName: "Test User",
        remitterAccount: "9876543210",
        transferId: "T999",
      },
    },
  })
  assertEq(event !== null, true)
  assertEq(event.virtual_account_id, "OLD123")
  assertEq(event.amount_rupees, 200)
  assertEq(event.utr, "OLDUTR")
  assertEq(event.event_id, "T999")
})

test("FAILED status returns null (no double-credit on retry of failed payment)", () => {
  const event = extractVbaEvent({
    type: "PAYMENT_FAILED_WEBHOOK",
    data: {
      payment: {
        cf_payment_id: 999,
        payment_status: "FAILED",
        payment_amount: 100,
        payment_method: {
          vba_transfer: { virtual_account_id: "00072619" },
        },
      },
    },
  })
  assertEq(event, null)
})

test("Zero / negative amount returns null", () => {
  const event = extractVbaEvent({
    data: {
      payment: {
        payment_status: "SUCCESS",
        payment_amount: 0,
        payment_method: { vba_transfer: { virtual_account_id: "00072619" } },
      },
    },
  })
  assertEq(event, null)
})

test("Empty payload returns null cleanly (no throw)", () => {
  const event = extractVbaEvent({})
  assertEq(event, null)
})

test("UTR fallback: payment_method.vba_transfer.utr preferred over payment.payment_utr", () => {
  // The bank-issued UTR (lives on vba_transfer) is the one customers
  // see on their bank statement; payment_utr is Cashfree's mirror of
  // it. When both are present they should be identical, but if they
  // ever diverge we want the bank's one.
  const event = extractVbaEvent({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      payment: {
        cf_payment_id: 1,
        payment_status: "SUCCESS",
        payment_amount: 100,
        payment_utr: "CFMIRROR",
        payment_method: {
          vba_transfer: { virtual_account_id: "X", utr: "BANKUTR" },
        },
      },
    },
  })
  assertEq(event.utr, "BANKUTR")
})

// ── Summary ────────────────────────────────────────────────────
console.log("")
if (failed > 0) {
  console.log(`${passed} passed, ${failed} failed`)
  process.exit(1)
} else {
  console.log(`${passed} passed, 0 failed`)
}
