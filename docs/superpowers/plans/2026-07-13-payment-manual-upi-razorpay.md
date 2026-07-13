# Payment Overhaul — Manual UPI + Razorpay (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give RISITEX checkout exactly two payment options — Manual UPI (0% charges, admin-verified) and Razorpay (dynamic gateway %, Phase-2 for live capture) — backed by an admin-editable `payment_settings` module and an admin payment-verification page.

**Architecture:** A new single-row `payment_settings` Medusa module holds runtime config (gateway %, UPI ID, QR, enable flags). Checkout consolidates to two cards; Manual UPI captures a transaction ID and rides along with the existing `createPurchaseOrder` flow, landing the PO in `awaiting_verification`. An admin page approves/rejects/requests-clarification, reusing the existing `admin_approved_at` / `b2b_approved_at` approval writes so the storefront and admin views stay in sync. Razorpay's live capture + webhooks are explicitly Phase 2.

**Tech Stack:** Medusa v2 (backend), Next.js 15 App Router (storefront), vitest (tests), `@medusajs/ui` + `@medusajs/admin-sdk` (admin), zod (validation).

**Spec:** `docs/superpowers/specs/2026-07-13-payment-manual-upi-razorpay-design.md`

---

## File Structure

**Create (backend):**
- `apps/backend/src/lib/payment.ts` — pure helpers: gateway-fee, txn-id validation, amount match.
- `apps/backend/src/lib/__tests__/payment.test.ts` — vitest unit tests for the above.
- `apps/backend/src/modules/payment_settings/index.ts` — module registration.
- `apps/backend/src/modules/payment_settings/models/payment-setting.ts` — single-row model.
- `apps/backend/src/modules/payment_settings/service.ts` — MedusaService.
- `apps/backend/src/modules/payment_settings/migrations/Migration20260713000000.ts` — table + seed row.
- `apps/backend/src/api/admin/payment-settings/route.ts` — GET + POST (admin).
- `apps/backend/src/api/store/payment-settings/route.ts` — GET (public subset).
- `apps/backend/src/api/admin/payment-verifications/route.ts` — GET list.
- `apps/backend/src/api/admin/payment-verifications/[id]/decide/route.ts` — POST decide.
- `apps/backend/src/admin/routes/payment-settings/page.tsx` — admin settings UI.
- `apps/backend/src/admin/routes/payment-verifications/page.tsx` — admin verification UI.

**Modify (backend):**
- `apps/backend/medusa-config.ts` — register `payment_settings` module.
- `apps/backend/src/api/store/purchase-orders/route.ts` — accept + persist manual-UPI `payment`.
- `apps/backend/src/admin/widgets/b2b-order-approval.tsx` — render payment block.

**Create (storefront):**
- `apps/storefront/src/lib/payment-settings.ts` — `getPaymentSettings()` + types + gateway-fee helper.
- `apps/storefront/src/components/checkout/manual-upi-panel.tsx` — UPI capture UI.

**Modify (storefront):**
- `apps/storefront/src/lib/purchase-orders.ts` — extend `CreatePurchaseOrderInput` with `payment`.
- `apps/storefront/src/app/b2b/checkout/page.tsx` — 2 methods, UPI panel, Razorpay breakdown, placeOrder wiring.

---

## Task 1: Payment pure-logic lib + tests (backend)

**Files:**
- Create: `apps/backend/src/lib/payment.ts`
- Test: `apps/backend/src/lib/__tests__/payment.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/lib/__tests__/payment.test.ts
import { describe, it, expect } from "vitest"
import {
  computeGatewayFeePaise,
  isValidUpiTransactionId,
  amountsMatchPaise,
} from "../payment"

describe("computeGatewayFeePaise", () => {
  it("returns 2% of the total, rounded to the nearest paise", () => {
    expect(computeGatewayFeePaise(100000, 2)).toBe(2000) // ₹1000 -> ₹20
  })
  it("returns 0 when pct is 0", () => {
    expect(computeGatewayFeePaise(100000, 0)).toBe(0)
  })
  it("rounds half-paise up", () => {
    expect(computeGatewayFeePaise(101, 2)).toBe(2) // 2.02 -> 2
  })
  it("clamps negative or NaN pct to 0", () => {
    expect(computeGatewayFeePaise(100000, -5)).toBe(0)
    expect(computeGatewayFeePaise(100000, Number.NaN)).toBe(0)
  })
})

describe("isValidUpiTransactionId", () => {
  it("accepts a 12-char alphanumeric ref", () => {
    expect(isValidUpiTransactionId("AX12BC34DE56")).toBe(true)
  })
  it("rejects empty / whitespace", () => {
    expect(isValidUpiTransactionId("")).toBe(false)
    expect(isValidUpiTransactionId("   ")).toBe(false)
  })
  it("rejects too short (<6) and too long (>40)", () => {
    expect(isValidUpiTransactionId("A1B2C")).toBe(false)
    expect(isValidUpiTransactionId("A".repeat(41))).toBe(false)
  })
  it("rejects non-alphanumeric", () => {
    expect(isValidUpiTransactionId("ABC-123-XYZ")).toBe(false)
    expect(isValidUpiTransactionId("ABC 123 XYZ")).toBe(false)
  })
})

describe("amountsMatchPaise", () => {
  it("matches identical amounts", () => {
    expect(amountsMatchPaise(123456, 123456)).toBe(true)
  })
  it("tolerates a 1-rupee (100 paise) rounding gap by default", () => {
    expect(amountsMatchPaise(123456, 123500)).toBe(true)
  })
  it("rejects a gap larger than tolerance", () => {
    expect(amountsMatchPaise(123456, 130000)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx vitest run src/lib/__tests__/payment.test.ts`
Expected: FAIL — "Failed to resolve import ../payment" / functions not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/lib/payment.ts
/**
 * Pure payment helpers shared by the checkout PO route and the payment
 * settings surface. No Medusa container access — kept unit-testable.
 */

/** Razorpay-style surcharge: `pct`% of the paise total, rounded to paise. */
export function computeGatewayFeePaise(totalPaise: number, pct: number): number {
  const safePct = Number.isFinite(pct) && pct > 0 ? pct : 0
  if (safePct === 0) return 0
  return Math.round((totalPaise * safePct) / 100)
}

/** UPI reference sanity: trimmed, 6–40 chars, alphanumeric only. */
export function isValidUpiTransactionId(value: unknown): boolean {
  if (typeof value !== "string") return false
  const v = value.trim()
  return v.length >= 6 && v.length <= 40 && /^[A-Za-z0-9]+$/.test(v)
}

/** Amounts (paise) match within a tolerance (default 100 paise = ₹1). */
export function amountsMatchPaise(
  a: number,
  b: number,
  tolerancePaise = 100,
): boolean {
  return Math.abs(a - b) <= tolerancePaise
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx vitest run src/lib/__tests__/payment.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/payment.ts apps/backend/src/lib/__tests__/payment.test.ts
git commit -m "feat(payment): pure gateway-fee + upi-ref + amount-match helpers"
```

---

## Task 2: `payment_settings` module (model + service + migration)

**Files:**
- Create: `apps/backend/src/modules/payment_settings/models/payment-setting.ts`
- Create: `apps/backend/src/modules/payment_settings/service.ts`
- Create: `apps/backend/src/modules/payment_settings/index.ts`
- Create: `apps/backend/src/modules/payment_settings/migrations/Migration20260713000000.ts`
- Modify: `apps/backend/medusa-config.ts`

- [ ] **Step 1: Create the model**

```ts
// apps/backend/src/modules/payment_settings/models/payment-setting.ts
import { model } from "@medusajs/framework/utils"

/**
 * Single-row runtime config for the two-rail checkout. The row's id is
 * always the constant `payment_settings` (see service.SETTINGS_ID) so
 * the admin/store routes upsert one canonical record. Secrets
 * (RAZORPAY_KEY_SECRET / WEBHOOK_SECRET) live ONLY in env — never here.
 */
export const PaymentSetting = model.define("payment_setting", {
  id: model.id().primaryKey(),
  manual_upi_enabled: model.boolean().default(true),
  razorpay_enabled: model.boolean().default(true),
  upi_id: model.text().default("risitex@upi"),
  upi_qr_image_url: model.text().nullable(),
  gateway_charge_percent: model.number().default(2),
  razorpay_mode: model.text().default("sandbox"),
  auto_capture: model.boolean().default(true),
})
```

- [ ] **Step 2: Create the service**

```ts
// apps/backend/src/modules/payment_settings/service.ts
import { MedusaService } from "@medusajs/framework/utils"
import { PaymentSetting } from "./models/payment-setting"

class PaymentSettingsModuleService extends MedusaService({
  PaymentSetting,
}) {}

export default PaymentSettingsModuleService
```

- [ ] **Step 3: Create the module index**

```ts
// apps/backend/src/modules/payment_settings/index.ts
import { Module } from "@medusajs/framework/utils"
import PaymentSettingsModuleService from "./service"

export const PAYMENT_SETTINGS_MODULE = "payment_settings"

/** Canonical single-row id. */
export const SETTINGS_ID = "payment_settings"

export default Module(PAYMENT_SETTINGS_MODULE, {
  service: PaymentSettingsModuleService,
})

export { PaymentSettingsModuleService }
```

- [ ] **Step 4: Create the migration (table + seed row)**

```ts
// apps/backend/src/modules/payment_settings/migrations/Migration20260713000000.ts
import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260713000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "payment_setting" (
        "id" text not null,
        "manual_upi_enabled" boolean not null default true,
        "razorpay_enabled" boolean not null default true,
        "upi_id" text not null default 'risitex@upi',
        "upi_qr_image_url" text null,
        "gateway_charge_percent" numeric not null default 2,
        "razorpay_mode" text not null default 'sandbox',
        "auto_capture" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "payment_setting_pkey" primary key ("id")
      );
    `)
    // Seed the canonical single row so GET works before any admin save.
    this.addSql(`
      insert into "payment_setting" ("id") values ('payment_settings')
      on conflict ("id") do nothing;
    `)
  }
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "payment_setting" cascade;`)
  }
}
```

- [ ] **Step 5: Register the module in `medusa-config.ts`**

In `apps/backend/medusa-config.ts`, inside the `modules: { ... }` object, add after the `purchase_order` block (around line 234):

```ts
        payment_settings: {
            resolve: "./src/modules/payment_settings",
        },
```

- [ ] **Step 6: Run the migration**

Run: `cd apps/backend && npx medusa db:migrate`
Expected: log shows `Running migration Migration20260713000000` and completes without error. (Requires DATABASE_URL reachable.)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/payment_settings apps/backend/medusa-config.ts
git commit -m "feat(payment): payment_settings single-row config module + migration"
```

---

## Task 3: Admin API — GET/POST /admin/payment-settings

**Files:**
- Create: `apps/backend/src/api/admin/payment-settings/route.ts`

- [ ] **Step 1: Write the route**

```ts
// apps/backend/src/api/admin/payment-settings/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  PAYMENT_SETTINGS_MODULE,
  SETTINGS_ID,
  PaymentSettingsModuleService,
} from "../../../modules/payment_settings"
import { logger } from "../../../utils/logger"

type Svc = PaymentSettingsModuleService & {
  retrievePaymentSetting: (id: string) => Promise<any>
  updatePaymentSettings: (data: any) => Promise<any>
  createPaymentSettings: (data: any) => Promise<any>
}

async function loadOrSeed(svc: Svc) {
  try {
    return await svc.retrievePaymentSetting(SETTINGS_ID)
  } catch {
    return await svc.createPaymentSettings({ id: SETTINGS_ID })
  }
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve(PAYMENT_SETTINGS_MODULE) as Svc
  const row = await loadOrSeed(svc)
  return res.json({ payment_settings: row })
}

const PatchBody = z.object({
  manual_upi_enabled: z.boolean().optional(),
  razorpay_enabled: z.boolean().optional(),
  upi_id: z.string().min(3).max(120).optional(),
  upi_qr_image_url: z.string().url().or(z.string().startsWith("/")).nullable().optional(),
  gateway_charge_percent: z.number().min(0).max(100).optional(),
  razorpay_mode: z.enum(["sandbox", "production"]).optional(),
  auto_capture: z.boolean().optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = PatchBody.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ message: "Invalid input", errors: parsed.error.flatten() })
  }
  try {
    const svc = req.scope.resolve(PAYMENT_SETTINGS_MODULE) as Svc
    await loadOrSeed(svc)
    const updated = await svc.updatePaymentSettings({
      id: SETTINGS_ID,
      ...parsed.data,
    })
    const row = Array.isArray(updated) ? updated[0] : updated
    return res.json({ payment_settings: row })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[admin/payment-settings] update failed", { error: message })
    return res.status(500).json({ message: "Couldn't save payment settings." })
  }
}
```

- [ ] **Step 2: Verify manually (after Task 12 restart)**

Run (authenticated admin cookie required — do in the admin UI or via curl with a session):
`curl -s http://localhost:9000/admin/payment-settings -H "Cookie: <admin session>"`
Expected: `{ "payment_settings": { "id": "payment_settings", "gateway_charge_percent": 2, ... } }`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/api/admin/payment-settings/route.ts
git commit -m "feat(payment): admin GET/POST /admin/payment-settings"
```

---

## Task 4: Store API — GET /store/payment-settings (public subset)

**Files:**
- Create: `apps/backend/src/api/store/payment-settings/route.ts`

- [ ] **Step 1: Write the route**

```ts
// apps/backend/src/api/store/payment-settings/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  PAYMENT_SETTINGS_MODULE,
  SETTINGS_ID,
  PaymentSettingsModuleService,
} from "../../../modules/payment_settings"

/**
 * Public subset — NEVER exposes razorpay_mode / auto_capture / secrets.
 * The storefront checkout reads this to render the two cards + the
 * dynamic gateway %. Falls back to safe defaults if the row is missing
 * so checkout never hard-fails on a settings hiccup.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const fallback = {
    manual_upi_enabled: true,
    razorpay_enabled: true,
    upi_id: "risitex@upi",
    upi_qr_image_url: null as string | null,
    gateway_charge_percent: 2,
  }
  try {
    const svc = req.scope.resolve(PAYMENT_SETTINGS_MODULE) as PaymentSettingsModuleService & {
      retrievePaymentSetting: (id: string) => Promise<any>
    }
    const row = await svc.retrievePaymentSetting(SETTINGS_ID)
    return res.json({
      payment_settings: {
        manual_upi_enabled: !!row.manual_upi_enabled,
        razorpay_enabled: !!row.razorpay_enabled,
        upi_id: row.upi_id ?? fallback.upi_id,
        upi_qr_image_url: row.upi_qr_image_url ?? null,
        gateway_charge_percent: Number(row.gateway_charge_percent ?? 2),
      },
    })
  } catch {
    return res.json({ payment_settings: fallback })
  }
}
```

- [ ] **Step 2: Confirm it is publicly reachable**

`/store/*` routes are store-scoped; they require the publishable key header but not auth. Verify Task 12 restart, then:
`curl -s http://localhost:9000/store/payment-settings -H "x-publishable-api-key: <PUB_KEY>"`
Expected: JSON with only the 5 public fields (no `razorpay_mode`, no `auto_capture`).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/api/store/payment-settings/route.ts
git commit -m "feat(payment): public GET /store/payment-settings (safe subset)"
```

---

## Task 5: Admin settings UI route

**Files:**
- Create: `apps/backend/src/admin/routes/payment-settings/page.tsx`

- [ ] **Step 1: Write the admin page**

```tsx
// apps/backend/src/admin/routes/payment-settings/page.tsx
import React, { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import { Button, Container, Heading, Input, Label, Switch, Text, toast } from "@medusajs/ui"

type Settings = {
  manual_upi_enabled: boolean
  razorpay_enabled: boolean
  upi_id: string
  upi_qr_image_url: string | null
  gateway_charge_percent: number
  razorpay_mode: string
  auto_capture: boolean
}

const PaymentSettingsPage = () => {
  const [s, setS] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch("/admin/payment-settings", { credentials: "include" })
      .then((r) => r.json())
      .then((b) => setS(b.payment_settings))
      .catch(() => toast.error("Couldn't load payment settings"))
  }, [])

  const save = async () => {
    if (!s) return
    setBusy(true)
    try {
      const res = await fetch("/admin/payment-settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manual_upi_enabled: s.manual_upi_enabled,
          razorpay_enabled: s.razorpay_enabled,
          upi_id: s.upi_id,
          upi_qr_image_url: s.upi_qr_image_url || null,
          gateway_charge_percent: Number(s.gateway_charge_percent) || 0,
          razorpay_mode: s.razorpay_mode === "production" ? "production" : "sandbox",
          auto_capture: s.auto_capture,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success("Payment settings saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  if (!s) return <Container className="p-6"><Text>Loading…</Text></Container>

  return (
    <Container className="p-6">
      <Heading level="h1" className="mb-6">Payment Settings</Heading>
      <div className="flex flex-col gap-y-6 max-w-xl">
        <div className="flex items-center justify-between">
          <Label>Enable Manual UPI</Label>
          <Switch checked={s.manual_upi_enabled} onCheckedChange={(v) => setS({ ...s, manual_upi_enabled: v })} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Enable Razorpay</Label>
          <Switch checked={s.razorpay_enabled} onCheckedChange={(v) => setS({ ...s, razorpay_enabled: v })} />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label>UPI ID</Label>
          <Input value={s.upi_id} onChange={(e) => setS({ ...s, upi_id: e.currentTarget.value })} />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label>UPI QR image URL (optional)</Label>
          <Input placeholder="/uploads/… or https://…" value={s.upi_qr_image_url ?? ""} onChange={(e) => setS({ ...s, upi_qr_image_url: e.currentTarget.value })} />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label>Gateway Charge % (Razorpay)</Label>
          <Input type="number" step="0.1" min="0" max="100" value={String(s.gateway_charge_percent)} onChange={(e) => setS({ ...s, gateway_charge_percent: Number(e.currentTarget.value) })} />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label>Razorpay mode</Label>
          <select className="border rounded px-2 py-1 bg-ui-bg-field" value={s.razorpay_mode} onChange={(e) => setS({ ...s, razorpay_mode: e.currentTarget.value })}>
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
          <Text size="small" className="text-ui-fg-subtle">Keys/secrets are read from env, never stored here.</Text>
        </div>
        <div className="flex items-center justify-between">
          <Label>Auto-capture (Phase 2)</Label>
          <Switch checked={s.auto_capture} onCheckedChange={(v) => setS({ ...s, auto_capture: v })} />
        </div>
        <Button variant="primary" disabled={busy} onClick={() => void save()}>Save</Button>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Payment Settings",
  icon: CurrencyDollar,
})

export default PaymentSettingsPage
```

- [ ] **Step 2: Verify (after Task 12 restart)**

Open the admin UI → sidebar shows **Payment Settings**. Change the gateway % → Save → toast success. Reload → value persists.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/admin/routes/payment-settings/page.tsx
git commit -m "feat(payment): admin Payment Settings UI"
```

---

## Task 6: Extend PO POST route for Manual UPI capture

**Files:**
- Modify: `apps/backend/src/api/store/purchase-orders/route.ts`

- [ ] **Step 1: Add imports + payment schema**

At the top imports of `route.ts`, add:

```ts
import { isValidUpiTransactionId, amountsMatchPaise } from "../../../lib/payment"
```

Inside `PostBody` (the `z.object({...})` around line 178), add a `payment` field:

```ts
  payment: z
    .object({
      method: z.literal("manual_upi"),
      upi_transaction_id: z.string().min(1).max(60),
      payment_date: z.string(),
      remarks: z.string().max(2000).optional(),
      screenshot_url: z.string().url().or(z.string().startsWith("/")).optional(),
      amount_paid_major: z.number().nonnegative().max(100_000_000),
    })
    .optional(),
```

- [ ] **Step 2: Validate + build payment metadata**

Immediately after `const input = parsed.data` (around line 205), add:

```ts
  // Manual-UPI capture: re-validate server-side. The client amount is
  // advisory — the authoritative order total is value_major below; we
  // reject a mismatch beyond ₹1 tolerance so a tampered client can't
  // under-report. Never trust the browser for money.
  let paymentMeta: Record<string, unknown> | null = null
  if (input.payment) {
    const p = input.payment
    if (!isValidUpiTransactionId(p.upi_transaction_id)) {
      return res.status(422).json({ message: "Invalid UPI transaction ID." })
    }
    const paidDate = new Date(p.payment_date)
    if (Number.isNaN(paidDate.getTime()) || paidDate.getTime() > Date.now() + 86_400_000) {
      return res.status(422).json({ message: "Invalid payment date." })
    }
    if (!amountsMatchPaise(Math.round(p.amount_paid_major * 100), input.value_major * 100)) {
      return res.status(422).json({ message: "Paid amount does not match the order total." })
    }
    paymentMeta = {
      payment_method: "manual_upi",
      payment_status: "awaiting_verification",
      upi_transaction_id: p.upi_transaction_id.trim(),
      payment_date: paidDate.toISOString(),
      remarks: p.remarks?.trim() || null,
      screenshot_url: p.screenshot_url || null,
      amount_paid_major: input.value_major,
      payment_captured_at: new Date().toISOString(),
    }
  }
```

- [ ] **Step 3: Merge payment metadata into the PO create call**

Find the `createPurchaseOrders({ ... metadata: input.notes ? { notes: input.notes } : null, })` call (around line 349) and replace the `metadata:` line with:

```ts
      metadata: {
        ...(input.notes ? { notes: input.notes } : {}),
        ...(paymentMeta ?? {}),
      },
```

- [ ] **Step 4: Mirror the payment summary onto the linked order metadata**

Immediately after `orderId = createdOrder.id` (inside the order-creation `try`, around line 321), add:

```ts
        if (paymentMeta) {
          try {
            await orderModule.updateOrders([
              {
                id: createdOrder.id,
                metadata: {
                  ...(createdOrder.metadata || {}),
                  payment_method: paymentMeta.payment_method,
                  payment_status: paymentMeta.payment_status,
                  upi_transaction_id: paymentMeta.upi_transaction_id,
                  amount_paid_major: paymentMeta.amount_paid_major,
                },
              },
            ])
          } catch (mErr) {
            logger.warn(`[purchase-orders] payment metadata mirror failed: ${mErr instanceof Error ? mErr.message : mErr}`)
          }
        }
```

- [ ] **Step 5: Verify (after Task 12 restart) — manual E2E in Task 12.**

Type-check now: `cd apps/backend && npx tsc --noEmit -p tsconfig.json` (or the repo's lint) — expect no new errors in `route.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/api/store/purchase-orders/route.ts
git commit -m "feat(payment): capture manual-UPI payment on PO create (server-validated)"
```

---

## Task 7: Storefront lib — settings fetch + extend PO input

**Files:**
- Create: `apps/storefront/src/lib/payment-settings.ts`
- Modify: `apps/storefront/src/lib/purchase-orders.ts`

- [ ] **Step 1: Create the settings client + gateway-fee helper**

```ts
// apps/storefront/src/lib/payment-settings.ts
import { MEDUSA_BASE_URL } from "./medusa";

export type StorePaymentSettings = {
  manual_upi_enabled: boolean;
  razorpay_enabled: boolean;
  upi_id: string;
  upi_qr_image_url: string | null;
  gateway_charge_percent: number;
};

const FALLBACK: StorePaymentSettings = {
  manual_upi_enabled: true,
  razorpay_enabled: true,
  upi_id: "risitex@upi",
  upi_qr_image_url: null,
  gateway_charge_percent: 2,
};

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/** Never throws — checkout must render even if settings are unreachable. */
export async function getPaymentSettings(): Promise<StorePaymentSettings> {
  try {
    const res = await fetch(`${MEDUSA_BASE_URL}/store/payment-settings`, {
      headers: { "x-publishable-api-key": PUB_KEY },
      credentials: "include",
    });
    if (!res.ok) return FALLBACK;
    const b = (await res.json()) as { payment_settings?: Partial<StorePaymentSettings> };
    return { ...FALLBACK, ...(b.payment_settings ?? {}) };
  } catch {
    return FALLBACK;
  }
}

/** Mirror of the backend helper — keep in sync with lib/payment.ts. */
export function computeGatewayFeePaise(totalPaise: number, pct: number): number {
  const safePct = Number.isFinite(pct) && pct > 0 ? pct : 0;
  if (safePct === 0) return 0;
  return Math.round((totalPaise * safePct) / 100);
}
```

- [ ] **Step 2: Extend `CreatePurchaseOrderInput` in `purchase-orders.ts`**

In `apps/storefront/src/lib/purchase-orders.ts`, add to the `CreatePurchaseOrderInput` type (after the `shipping_address` field, before the closing `}`):

```ts
  /** Manual-UPI capture — present only when the buyer chose Manual UPI. */
  payment?: {
    method: "manual_upi";
    upi_transaction_id: string;
    payment_date: string; // ISO
    remarks?: string;
    screenshot_url?: string;
    amount_paid_major: number;
  };
```

- [ ] **Step 3: Verify types compile**

Run: `cd apps/storefront && npx tsc --noEmit` (or `pnpm --filter storefront typecheck` if defined).
Expected: no new errors from these two files.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/lib/payment-settings.ts apps/storefront/src/lib/purchase-orders.ts
git commit -m "feat(payment): storefront payment-settings client + PO payment input"
```

---

## Task 8: Manual UPI panel component (storefront)

**Files:**
- Create: `apps/storefront/src/components/checkout/manual-upi-panel.tsx`

- [ ] **Step 1: Write the panel**

```tsx
// apps/storefront/src/components/checkout/manual-upi-panel.tsx
"use client";

import * as React from "react";

export type ManualUpiValue = {
  upiTransactionId: string;
  paymentDate: string; // yyyy-mm-dd
  remarks: string;
  screenshotUrl: string | null;
};

/** Same rule as backend lib/payment.ts isValidUpiTransactionId. */
export function isValidUpiRef(v: string): boolean {
  const t = v.trim();
  return t.length >= 6 && t.length <= 40 && /^[A-Za-z0-9]+$/.test(t);
}

export function ManualUpiPanel({
  upiId,
  qrImageUrl,
  amountLabel,
  value,
  onChange,
  showErrors,
  onUploadScreenshot,
}: {
  upiId: string;
  qrImageUrl: string | null;
  amountLabel: string;
  value: ManualUpiValue;
  onChange: (v: ManualUpiValue) => void;
  showErrors: boolean;
  onUploadScreenshot?: (file: File) => Promise<string>;
}) {
  const [copied, setCopied] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const refError =
    showErrors && !isValidUpiRef(value.upiTransactionId)
      ? "Enter the 6–40 character alphanumeric UPI reference."
      : "";

  const copyUpi = async () => {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadScreenshot) return;
    setUploading(true);
    try {
      const url = await onUploadScreenshot(file);
      onChange({ ...value, screenshotUrl: url });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-raised p-5 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="shrink-0">
          {qrImageUrl ? (
            <img src={qrImageUrl} alt="RISITEX UPI QR" className="h-40 w-40 rounded-lg object-contain border border-border-subtle bg-white" />
          ) : (
            <div className="h-40 w-40 rounded-lg border border-dashed border-border-strong flex items-center justify-center text-center text-body-sm text-text-muted p-3">
              Official RISITEX QR will be uploaded soon.
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-3">
          <div>
            <div className="text-body-sm text-text-muted">Pay to UPI ID</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-body-md text-text-primary">{upiId}</span>
              <button type="button" onClick={() => void copyUpi()} className="text-body-sm underline text-text-secondary hover:text-text-primary">
                {copied ? "Copied" : "Copy UPI ID"}
              </button>
              {qrImageUrl ? (
                <a href={qrImageUrl} download className="text-body-sm underline text-text-secondary hover:text-text-primary">Download QR</a>
              ) : null}
            </div>
          </div>
          <div>
            <div className="text-body-sm text-text-muted">Amount to Pay</div>
            <div className="text-title-md font-semibold text-text-primary">{amountLabel}</div>
          </div>
          <p className="text-body-sm text-text-muted">
            Pay the exact amount above to this UPI ID from any UPI app, then enter your transaction reference below. Your order is placed immediately and confirmed once our team verifies the payment.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-body-sm text-text-secondary">UPI Transaction ID<span className="text-brand-accent">*</span></label>
          <input
            type="text"
            value={value.upiTransactionId}
            onChange={(e) => onChange({ ...value, upiTransactionId: e.target.value })}
            placeholder="e.g. 4471XXionXXXX"
            className="h-10 rounded-lg border border-border-subtle bg-surface-background px-3 text-body-md"
          />
          {refError ? <span className="text-body-xs text-red-500">{refError}</span> : null}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-body-sm text-text-secondary">Payment Date</label>
          <input
            type="date"
            value={value.paymentDate}
            onChange={(e) => onChange({ ...value, paymentDate: e.target.value })}
            className="h-10 rounded-lg border border-border-subtle bg-surface-background px-3 text-body-md"
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-body-sm text-text-secondary">Remarks (optional)</label>
          <textarea
            value={value.remarks}
            onChange={(e) => onChange({ ...value, remarks: e.target.value })}
            rows={2}
            className="rounded-lg border border-border-subtle bg-surface-background px-3 py-2 text-body-md"
          />
        </div>
        {onUploadScreenshot ? (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-body-sm text-text-secondary">Upload Screenshot (optional)</label>
            <input type="file" accept="image/*" onChange={(e) => void handleFile(e)} className="text-body-sm" />
            {uploading ? <span className="text-body-xs text-text-muted">Uploading…</span> : null}
            {value.screenshotUrl ? <span className="text-body-xs text-green-600">Screenshot attached</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/storefront && npx tsc --noEmit`
Expected: no errors from `manual-upi-panel.tsx`. (Design-token classes like `bg-surface-raised`, `text-text-muted` already exist in the `@risitex/ui` preset.)

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/components/checkout/manual-upi-panel.tsx
git commit -m "feat(payment): Manual UPI capture panel component"
```

---

## Task 9: Checkout rework — two methods + UPI + Razorpay breakdown

**Files:**
- Modify: `apps/storefront/src/app/b2b/checkout/page.tsx`

> This is the largest task. Read the file first (it is ~1435 lines). Key anchors: `PAYMENT_METHODS` (122), `PAYMENT_METHOD_TO_BACKEND` (149), `PAYMENT_PROOF_CONFIG` (158), payment state (326–347), totals (359–394), `paymentReady`/`canStep5` (430–437), `placeOrder` (487–630), the payment-step JSX (1076–1230), and the order-summary rows (1322–1345).

- [ ] **Step 1: Replace `PAYMENT_METHODS` and its mapping (lines 122–221 region)**

Replace the `PAYMENT_METHODS`, `PaymentMethodId`, `PAYMENT_METHOD_TO_BACKEND`, and `PAYMENT_PROOF_CONFIG` declarations with just:

```ts
const PAYMENT_METHODS = [
  {
    id: "manual_upi",
    label: "Manual UPI Payment",
    badge: "0% Charges",
    desc: "Pay by UPI to our official ID and enter your transaction reference. Verified by our team.",
  },
  {
    id: "razorpay",
    label: "Razorpay Payment",
    badge: "", // filled at render with the dynamic gateway %
    desc: "UPI · Cards · Net Banking · Wallets — automatic online payment.",
  },
] as const;

type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];
```

Delete every remaining reference to `PAYMENT_METHOD_TO_BACKEND`, `PAYMENT_PROOF_CONFIG`, and `PaymentConfirmation` in this file (they belonged to the removed proof flow). The import of `confirmPurchaseOrderPayment` / `PaymentConfirmation` from `@/lib/purchase-orders` (line ~19) should also be removed if now unused.

- [ ] **Step 2: Update payment state + settings fetch (326–347 region)**

Change the default method and add settings + UPI state:

```ts
  const [paymentMethodId, setPaymentMethodId] = React.useState<PaymentMethodId>("manual_upi");
  const [paySettings, setPaySettings] = React.useState<StorePaymentSettings | null>(null);
  const [upiValue, setUpiValue] = React.useState<ManualUpiValue>({
    upiTransactionId: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    remarks: "",
    screenshotUrl: null,
  });
  const [showUpiErrors, setShowUpiErrors] = React.useState(false);
```

Add the imports at the top of the file:

```ts
import { getPaymentSettings, computeGatewayFeePaise, type StorePaymentSettings } from "@/lib/payment-settings";
import { ManualUpiPanel, isValidUpiRef, type ManualUpiValue } from "@/components/checkout/manual-upi-panel";
```

Add a settings fetch effect near the other effects (e.g. after the cart-load effect around 224):

```ts
  React.useEffect(() => {
    let alive = true;
    void getPaymentSettings().then((s) => {
      if (!alive) return;
      setPaySettings(s);
      // If only one method is enabled, auto-select it.
      if (s.manual_upi_enabled && !s.razorpay_enabled) setPaymentMethodId("manual_upi");
      else if (!s.manual_upi_enabled && s.razorpay_enabled) setPaymentMethodId("razorpay");
    });
    return () => { alive = false; };
  }, []);
```

Remove now-dead state: `paymentReference`, `paymentPaidAt`, `paymentProofNotes` (343–347) and their usages.

- [ ] **Step 3: Derived gateway values (add near totals, after line 394)**

```ts
  const gatewayPct = paySettings?.gateway_charge_percent ?? 0;
  const gatewayFeePaise =
    paymentMethodId === "razorpay" ? computeGatewayFeePaise(grandTotalPaise, gatewayPct) : 0;
  const finalPayablePaise = grandTotalPaise + gatewayFeePaise;
```

- [ ] **Step 4: Gate `paymentReady` / `canStep5` (430–437 region)**

Replace the wallet-based `paymentReady` with:

```ts
  const paymentReady = () => {
    if (paymentMethodId === "manual_upi") return isValidUpiRef(upiValue.upiTransactionId);
    if (paymentMethodId === "razorpay") return false; // Phase 2: live capture not wired yet
    return false;
  };
```

Keep `const canStep5 = canStep4 && !!paymentMethodId && paymentReady();`.

- [ ] **Step 5: Rewrite the payment-step JSX (1076–1230 region)**

Replace the `PAYMENT_METHODS.map(...)` block and the proof-config block with two cards + conditional panels:

```tsx
{PAYMENT_METHODS.filter((m) => {
  if (!paySettings) return true;
  return m.id === "manual_upi" ? paySettings.manual_upi_enabled : paySettings.razorpay_enabled;
}).map((m) => {
  const selected = paymentMethodId === m.id;
  const badge = m.id === "razorpay"
    ? (gatewayPct > 0 ? `+${gatewayPct}% Gateway Charges` : "Automatic")
    : m.badge;
  return (
    <label
      key={m.id}
      className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${
        selected ? "border-text-primary bg-surface-sunken" : "border-border-subtle hover:border-border-strong"
      }`}
    >
      <input
        type="radio"
        name="payment-method"
        className="mt-1"
        checked={selected}
        onChange={() => setPaymentMethodId(m.id)}
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary">{m.label}</span>
          {badge ? (
            <span className={`text-body-xs rounded-full px-2 py-0.5 ${m.id === "manual_upi" ? "bg-green-100 text-green-700" : "bg-surface-sunken text-text-secondary"}`}>{badge}</span>
          ) : null}
        </div>
        <p className="text-body-sm text-text-muted mt-0.5">{m.desc}</p>
      </div>
    </label>
  );
})}

{paymentMethodId === "manual_upi" && paySettings ? (
  <ManualUpiPanel
    upiId={paySettings.upi_id}
    qrImageUrl={paySettings.upi_qr_image_url}
    amountLabel={formatRupees(grandTotalPaise)}
    value={upiValue}
    onChange={setUpiValue}
    showErrors={showUpiErrors}
    onUploadScreenshot={uploadFile}
  />
) : null}

{paymentMethodId === "razorpay" && paySettings ? (
  <div className="rounded-2xl border border-border-subtle bg-surface-raised p-5 flex flex-col gap-2">
    <Row label="Subtotal (incl. GST + shipping)" value={formatRupees(grandTotalPaise)} />
    <Row label={`Gateway Fee (${gatewayPct}%)`} value={formatRupees(gatewayFeePaise)} />
    <div className="border-t border-border-subtle pt-2 flex justify-between font-semibold text-text-primary">
      <span>Final Payable</span><span>{formatRupees(finalPayablePaise)}</span>
    </div>
    <p className="text-body-sm text-text-muted mt-1">
      Razorpay automatic payment is being enabled. For now, please use Manual UPI to place your order.
    </p>
  </div>
) : null}
```

Add the `uploadFile` import (top of file): `import { createPurchaseOrder, uploadFile } from "@/lib/purchase-orders";` (merge with the existing import from `@/lib/purchase-orders`).

- [ ] **Step 6: Wire `placeOrder` (487–630 region)**

At the top of `placeOrder`, gate Razorpay and require a valid UPI ref:

```ts
    if (paymentMethodId === "razorpay") {
      toast.error("Razorpay is being enabled. Please use Manual UPI for now.");
      return;
    }
    if (paymentMethodId === "manual_upi" && !isValidUpiRef(upiValue.upiTransactionId)) {
      setShowUpiErrors(true);
      toast.error("Enter a valid UPI transaction ID.");
      return;
    }
```

(`toast` is already imported/used in this file for other errors; if not, use the existing error surface the file already uses.)

In the `createPurchaseOrder({ ... })` call (around 533), add the `payment` field when Manual UPI:

```ts
        payment: paymentMethodId === "manual_upi" ? {
          method: "manual_upi" as const,
          upi_transaction_id: upiValue.upiTransactionId.trim(),
          payment_date: new Date(upiValue.paymentDate).toISOString(),
          remarks: upiValue.remarks.trim() || undefined,
          screenshot_url: upiValue.screenshotUrl || undefined,
          amount_paid_major: paiseToRupees(grandTotalPaise),
        } : undefined,
```

Remove the old proof-recording block (the `PAYMENT_PROOF_CONFIG` / `confirmPurchaseOrderPayment` / wallet branch around 588–605) — capture now happens in the create call.

- [ ] **Step 7: Update the "Place order" button label (1307–1311 region)**

The button already reads `Place order ({formatRupees(grandTotalPaise)})`. Leave as-is for Manual UPI (0% charges → grand total is the payable). No change needed.

- [ ] **Step 8: Type-check + smoke render**

Run: `cd apps/storefront && npx tsc --noEmit`
Expected: no errors. Then in Task 12, load `/b2b/checkout` and confirm two cards render, Manual UPI shows the panel, Razorpay shows the breakdown + notice.

- [ ] **Step 9: Commit**

```bash
git add apps/storefront/src/app/b2b/checkout/page.tsx
git commit -m "feat(payment): checkout to Manual UPI + Razorpay with dynamic gateway charges"
```

---

## Task 10: Admin decide endpoint (approve / reject / clarify)

**Files:**
- Create: `apps/backend/src/api/admin/payment-verifications/[id]/decide/route.ts`

- [ ] **Step 1: Write the route**

```ts
// apps/backend/src/api/admin/payment-verifications/[id]/decide/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../../../modules/purchase_order"
import { logger } from "../../../../../utils/logger"

const Body = z.object({
  decision: z.enum(["approve", "reject", "clarify"]),
  note: z.string().max(2000).optional(),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const poId = req.params.id
  const parsed = Body.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ message: "Invalid input" })
  }
  const { decision, note } = parsed.data
  const actorName =
    (req as any).auth_context?.app_metadata?.first_name ||
    (req as any).auth_context?.actor_id ||
    "admin"

  try {
    const poModule = req.scope.resolve(
      PURCHASE_ORDER_MODULE,
    ) as PurchaseOrderModuleService & {
      retrievePurchaseOrder: (id: string) => Promise<any>
      updatePurchaseOrders: (data: any) => Promise<any>
    }
    const po = await poModule.retrievePurchaseOrder(poId)
    if (!po) return res.status(404).json({ message: "Purchase order not found." })

    const meta = (po.metadata ?? {}) as Record<string, unknown>
    const now = new Date().toISOString()
    let nextMeta: Record<string, unknown>
    let orderPaymentStatus: string

    if (decision === "approve") {
      // Idempotent: approving an already-approved PO is a no-op.
      nextMeta = {
        ...meta,
        payment_status: "paid",
        payment_verified_at: meta.payment_verified_at ?? now,
        payment_verified_by: meta.payment_verified_by ?? actorName,
        admin_approved_at: meta.admin_approved_at ?? now,
        admin_approved_by_name: meta.admin_approved_by_name ?? actorName,
      }
      orderPaymentStatus = "paid"
    } else if (decision === "reject") {
      nextMeta = {
        ...meta,
        payment_status: "rejected",
        payment_rejected_at: now,
        payment_rejected_reason: note ?? null,
      }
      orderPaymentStatus = "rejected"
    } else {
      nextMeta = {
        ...meta,
        payment_status: "clarification_requested",
        clarification_requested_at: now,
        clarification_note: note ?? null,
      }
      orderPaymentStatus = "clarification_requested"
    }

    await poModule.updatePurchaseOrders([{ id: po.id, metadata: nextMeta }])

    // Mirror onto the linked order metadata so the order-page widget stays
    // in sync, and (on approve) unblock the existing dispatch flow via
    // b2b_approved_at — the same flag /admin/orders/:id/b2b-approve sets.
    if (po.order_id) {
      try {
        const orderModule = req.scope.resolve(Modules.ORDER)
        const order = await orderModule.retrieveOrder(po.order_id)
        await orderModule.updateOrders([
          {
            id: po.order_id,
            metadata: {
              ...(order.metadata || {}),
              payment_status: orderPaymentStatus,
              ...(decision === "approve" ? { b2b_approved_at: (order.metadata as any)?.b2b_approved_at ?? now } : {}),
            },
          },
        ])
      } catch (mErr) {
        logger.warn(`[payment-verifications] order mirror failed: ${mErr instanceof Error ? mErr.message : mErr}`)
      }
    }

    return res.json({ ok: true, decision, payment_status: nextMeta.payment_status })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    logger.error("[payment-verifications/decide] failed", { po_id: poId, error: message })
    return res.status(500).json({ message: "Couldn't record the decision." })
  }
}
```

- [ ] **Step 2: Verify (after Task 12) — via the admin page in Task 11.**

Type-check: `cd apps/backend && npx tsc --noEmit -p tsconfig.json` — no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/api/admin/payment-verifications/\[id\]/decide/route.ts
git commit -m "feat(payment): admin decide endpoint (approve/reject/clarify, idempotent)"
```

---

## Task 11: Admin verification list API + page

**Files:**
- Create: `apps/backend/src/api/admin/payment-verifications/route.ts`
- Create: `apps/backend/src/admin/routes/payment-verifications/page.tsx`

- [ ] **Step 1: Write the list API**

```ts
// apps/backend/src/api/admin/payment-verifications/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  PURCHASE_ORDER_MODULE,
  PurchaseOrderModuleService,
} from "../../../modules/purchase_order"

/**
 * Lists purchase orders paid by Manual UPI, newest first. `status` query
 * filters by payment_status (default: awaiting_verification). Enriches each
 * row with the linked order's display_id + the customer/company ids the PO
 * already stores.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const status = (req.query.status as string) || "awaiting_verification"
  const poModule = req.scope.resolve(
    PURCHASE_ORDER_MODULE,
  ) as PurchaseOrderModuleService & {
    listPurchaseOrders: (filters: any, config?: any) => Promise<any[]>
  }

  const rows = await poModule.listPurchaseOrders(
    {},
    { take: 300, order: { created_at: "DESC" } },
  )

  const manual = (rows as any[]).filter((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>
    return m.payment_method === "manual_upi" && (status === "all" || m.payment_status === status)
  })

  // Resolve linked order display ids in one query.
  const orderIds = manual.map((r) => r.order_id).filter(Boolean)
  const orderById = new Map<string, any>()
  if (orderIds.length) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "email"],
      filters: { id: orderIds },
    })
    for (const o of orders ?? []) orderById.set(o.id, o)
  }

  const items = manual.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, any>
    const o = r.order_id ? orderById.get(r.order_id) : null
    return {
      id: r.id,
      po_number: r.po_number,
      order_id: r.order_id,
      order_display_id: o?.display_id ?? null,
      customer_id: r.customer_id,
      company_id: r.company_id,
      email: o?.email ?? null,
      amount_major: Math.round(Number(r.value_minor ?? 0) / 100),
      upi_transaction_id: m.upi_transaction_id ?? null,
      payment_date: m.payment_date ?? null,
      remarks: m.remarks ?? null,
      screenshot_url: m.screenshot_url ?? null,
      payment_status: m.payment_status ?? null,
      created_at: r.created_at,
    }
  })

  return res.json({ payment_verifications: items })
}
```

- [ ] **Step 2: Write the admin page**

```tsx
// apps/backend/src/admin/routes/payment-verifications/page.tsx
import React, { useEffect, useState, useCallback } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CheckCircleSolid } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text, toast } from "@medusajs/ui"

type Row = {
  id: string
  po_number: string
  order_display_id: number | null
  customer_id: string
  company_id: string | null
  email: string | null
  amount_major: number
  upi_transaction_id: string | null
  payment_date: string | null
  remarks: string | null
  screenshot_url: string | null
  payment_status: string | null
  created_at: string
}

const statusColor = (s: string | null) =>
  s === "paid" ? "green" : s === "rejected" ? "red" : s === "clarification_requested" ? "orange" : "grey"

const PaymentVerificationsPage = () => {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState("awaiting_verification")

  const load = useCallback(() => {
    fetch(`/admin/payment-verifications?status=${filter}`, { credentials: "include" })
      .then((r) => r.json())
      .then((b) => setRows(b.payment_verifications ?? []))
      .catch(() => toast.error("Couldn't load verifications"))
  }, [filter])

  useEffect(() => { load() }, [load])

  const decide = async (id: string, decision: "approve" | "reject" | "clarify") => {
    let note: string | undefined
    if (decision !== "approve") {
      note = window.prompt(decision === "reject" ? "Reason for rejection?" : "What clarification is needed?") || undefined
      if (decision === "reject" && !note) return
    }
    setBusy(id)
    try {
      const res = await fetch(`/admin/payment-verifications/${id}/decide`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success(`Payment ${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "clarification requested"}`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Container className="p-6">
      <div className="flex items-center justify-between mb-4">
        <Heading level="h1">Payment Verification</Heading>
        <select className="border rounded px-2 py-1 bg-ui-bg-field" value={filter} onChange={(e) => setFilter(e.currentTarget.value)}>
          <option value="awaiting_verification">Awaiting verification</option>
          <option value="paid">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="clarification_requested">Clarification requested</option>
          <option value="all">All</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <Text className="text-ui-fg-subtle">No Manual UPI payments in this state.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Company</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Txn ID</Table.HeaderCell>
              <Table.HeaderCell>Proof</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>{r.order_display_id ? `#${r.order_display_id}` : r.po_number}<div className="text-ui-fg-subtle text-xs">{r.email ?? r.customer_id}</div></Table.Cell>
                <Table.Cell>{r.company_id ?? "—"}</Table.Cell>
                <Table.Cell>₹{r.amount_major.toLocaleString("en-IN")}</Table.Cell>
                <Table.Cell><span className="font-mono text-xs">{r.upi_transaction_id ?? "—"}</span></Table.Cell>
                <Table.Cell>{r.screenshot_url ? <a className="underline" href={r.screenshot_url} target="_blank" rel="noreferrer">View</a> : "—"}</Table.Cell>
                <Table.Cell><Badge color={statusColor(r.payment_status)}>{r.payment_status ?? "—"}</Badge></Table.Cell>
                <Table.Cell>
                  <div className="flex gap-2">
                    <Button size="small" variant="primary" disabled={busy === r.id || r.payment_status === "paid"} onClick={() => void decide(r.id, "approve")}>Approve</Button>
                    <Button size="small" variant="danger" disabled={busy === r.id} onClick={() => void decide(r.id, "reject")}>Reject</Button>
                    <Button size="small" variant="secondary" disabled={busy === r.id} onClick={() => void decide(r.id, "clarify")}>Clarify</Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Payment Verification",
  icon: CheckCircleSolid,
})

export default PaymentVerificationsPage
```

- [ ] **Step 3: Verify (after Task 12) — appears in admin sidebar, lists a captured Manual UPI PO, Approve flips status to paid.**

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/api/admin/payment-verifications/route.ts apps/backend/src/admin/routes/payment-verifications/page.tsx
git commit -m "feat(payment): admin Payment Verification list + page"
```

---

## Task 12: Extend order-page widget + integrate & verify

**Files:**
- Modify: `apps/backend/src/admin/widgets/b2b-order-approval.tsx`

- [ ] **Step 1: Add a payment block to the widget**

In `b2b-order-approval.tsx`, extend `OrderMeta` with the mirrored payment fields:

```ts
type OrderMeta = {
  b2b_approved_at?: string | null
  b2b_approved_by_name?: string | null
  b2b_dispatched_at?: string | null
  b2b_transporter?: string | null
  b2b_tracking?: string | null
  payment_method?: string | null
  payment_status?: string | null
  upi_transaction_id?: string | null
  amount_paid_major?: number | null
}
```

Then, just inside the return (right after the `<div className="flex items-center justify-between mb-4">…</div>` header block, before the `!isApproved` block), add:

```tsx
      {meta.payment_method ? (
        <div className="mb-4 rounded-lg border border-ui-border-base p-3 flex flex-col gap-1">
          <Text size="small" className="font-medium">Payment</Text>
          <Text size="small" className="text-ui-fg-subtle">
            Method: {meta.payment_method === "manual_upi" ? "Manual UPI" : meta.payment_method}
            {" · Status: "}
            <span className="font-medium">{meta.payment_status ?? "—"}</span>
          </Text>
          {meta.upi_transaction_id ? (
            <Text size="small" className="text-ui-fg-subtle">Txn ID: <span className="font-mono">{meta.upi_transaction_id}</span></Text>
          ) : null}
          {typeof meta.amount_paid_major === "number" ? (
            <Text size="small" className="text-ui-fg-subtle">Amount: ₹{meta.amount_paid_major.toLocaleString("en-IN")}</Text>
          ) : null}
        </div>
      ) : null}
```

- [ ] **Step 2: Commit the widget**

```bash
git add apps/backend/src/admin/widgets/b2b-order-approval.tsx
git commit -m "feat(payment): show payment method/status/txn on order widget"
```

- [ ] **Step 3: Run the full backend test suite**

Run: `cd apps/backend && npx vitest run`
Expected: all tests pass, including the new `payment.test.ts`.

- [ ] **Step 4: Restart backend + storefront to register new modules/routes**

New Medusa modules, API routes, and admin routes require a backend restart to register. Restart both dev servers (backend :9000, storefront :3000). If the migration wasn't run in Task 2 Step 6, run `cd apps/backend && npx medusa db:migrate` first.

- [ ] **Step 5: Manual E2E checklist**

1. Admin → **Payment Settings**: set gateway % (e.g. 3), Save, reload → persists.
2. Storefront `/b2b/checkout`: two cards only — **Manual UPI (0% Charges)** + **Razorpay (+3% Gateway Charges)**. No wallet.
3. Select Razorpay → breakdown shows Subtotal → Gateway Fee (3%) → Final Payable + the "use Manual UPI for now" notice; Place order is blocked with a toast.
4. Select Manual UPI → QR placeholder, `risitex@upi` + Copy works, Amount to Pay = grand total. Leave Txn ID empty → Verify blocked with inline error. Enter `TESTUPI1234` → Place order succeeds.
5. Admin → **Payment Verification**: the order appears (awaiting_verification) with the txn ID + amount. Click **Approve** → status → paid.
6. Admin → the native **Order** page: the B2B widget shows the Payment block (Manual UPI · paid · txn ID) and the order is Approved → dispatch fields available.
7. Storefront `/b2b/orders/<id>`: green approved flow is live (driven by `admin_approved_at`).

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A && git commit -m "chore(payment): Phase 1 verification fixes" || echo "nothing to commit"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- Two methods only → Task 9. Manual UPI panel (QR/UPI-ID/copy/download/amount/instruction/txn-id/date/remarks/screenshot + validation) → Tasks 8, 9. 0% for UPI, dynamic % for Razorpay → Tasks 7, 9. Backend payment settings (enable flags, UPI ID, QR, gateway %, mode, auto-capture) → Tasks 2–5. Capture into order (method, txn, date, screenshot, remarks, amount, timestamp, customer, company, order id) → Task 6 (PO stores customer_id/company_id/order_id already; payment fields added to metadata). Statuses awaiting_verification / paid / rejected / clarification → Tasks 6, 10. Admin verification page with Approve/Reject/Request Clarification → Tasks 10, 11. Shipment gated behind approval → reuses existing `admin_approved_at` / `b2b_approved_at`, unchanged. Admin order display of method/status/charges/txn → Task 12. Razorpay reuse (RISITEX's own provider) + webhooks → explicitly Phase 2 (documented in spec).
- **Gap noted:** the checkout order-summary total line (1322–1345) shows `grandTotalPaise`; for Razorpay the payable is `finalPayablePaise`. Since Phase 1 blocks Razorpay checkout, the summary staying at `grandTotalPaise` is correct for the only completable path (Manual UPI). Phase 2 will switch the summary + button to `finalPayablePaise` when Razorpay capture is wired. No task needed now.

**Placeholder scan:** No TBD/TODO in code steps; every code step shows full content. The only "Phase 2" references are intentional scope markers, not missing work.

**Type consistency:** `computeGatewayFeePaise` signature identical in `lib/payment.ts` (backend) and `lib/payment-settings.ts` (storefront). `isValidUpiTransactionId` (backend) mirrors `isValidUpiRef` (storefront) — same 6–40 alphanumeric rule. PO `payment` shape identical across storefront input type (Task 7), panel value mapping (Task 9 Step 6), and backend zod schema (Task 6 Step 1). `payment_status` values (`awaiting_verification` / `paid` / `rejected` / `clarification_requested`) consistent across Tasks 6, 10, 11.
