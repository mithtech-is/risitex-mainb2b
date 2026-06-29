# PIX Discount Codes (FR-6.01) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins create alphanumeric discount codes constrained by minimum order units, max usage, and expiry, and let buyers apply them at wholesale checkout for a real discount — built on Medusa native Promotions, unified with campaign attribution.

**Architecture:** A discount code = a Medusa native Promotion (discount mechanics + native `limit`/`used` usage cap) **plus** a small custom `discount_code` record holding the PIX-specific fields Medusa can't (min order units, expiry, campaign link, combinable-with-tier). Apply/validate happens through a store endpoint that runs custom checks then Medusa's `updateCartPromotionsWorkflow`. Attribution is free via the existing `order-placed-campaign` subscriber (matches `order.promotions[].code` to a `marketing_campaign.code`).

**Tech Stack:** MedusaJS 2.15.5 (`risitex-v2`), Medusa admin SDK + `@medusajs/ui` (admin screen), Next.js storefront (`risitex/apps/storefront`), vitest (unit tests for pure logic).

**Spec:** `docs/superpowers/specs/2026-06-18-pix-discount-codes-design.md`. Refinement vs spec: PIX fields live in a custom `discount_code` module (not `promotion.metadata`), because `promotion.metadata` writability is unconfirmed and `b2b-cart.ts` currently reads `combinable_with_tier` from it; Task 8 repoints that read to the new module.

**Backend can't be run in the authoring environment.** Pure logic is unit-tested (vitest). Endpoint/workflow tasks include exact `curl` verification to run against a live `:9000` backend.

---

## File structure

Backend (`risitex-v2`):
- `src/modules/discount_code/models/discount-code.ts` — the PIX record (create).
- `src/modules/discount_code/validate.ts` — pure validators (create).
- `src/modules/discount_code/__tests__/validate.test.ts` — validator tests (create).
- `src/modules/discount_code/service.ts` — MedusaService + helpers (create).
- `src/modules/discount_code/index.ts` — module export (create).
- `medusa-config.ts` — register module (modify).
- `src/api/admin/discount-codes/route.ts` — POST create, GET list (create).
- `src/api/admin/discount-codes/[id]/route.ts` — DELETE (create).
- `src/api/store/carts/[id]/discount-code/route.ts` — POST apply, DELETE remove (create).
- `src/api/middlewares.ts` — register the two new matchers (modify).
- `src/lib/b2b-cart.ts` — read `combinable_with_tier` from the module (modify).
- `src/admin/routes/discount-codes/page.tsx` — admin screen (create).

Storefront (`risitex/apps/storefront`):
- `src/lib/discount-code.ts` — apply/remove client (create).
- `src/lib/__tests__/discount-code.test.ts` — client error-mapping test (create).
- `src/app/checkout/wholesale/page.tsx` — promo-code input + summary line (modify).

---

## Task 1: `discount_code` model + module registration

**Files:**
- Create: `src/modules/discount_code/models/discount-code.ts`
- Create: `src/modules/discount_code/service.ts`
- Create: `src/modules/discount_code/index.ts`
- Modify: `medusa-config.ts` (modules block, after the `campaign` entry ~line 237)

- [ ] **Step 1: Create the model**

`src/modules/discount_code/models/discount-code.ts`:
```typescript
import { model } from "@medusajs/framework/utils"

/**
 * PIX discount code (FR-6.01). Pairs a Medusa native Promotion (which owns the
 * discount math + native usage `limit`/`used`) with the constraints Medusa
 * can't express: minimum order UNITS, expiry, campaign link, and whether the
 * code may stack on a B2B buyer's tier pricing.
 *
 * `code` mirrors the Medusa promotion code (and, when linked, the
 * marketing_campaign code) so the existing campaign-attribution subscriber and
 * the b2b-cart exclusivity check can resolve it.
 */
export const DiscountCode = model
  .define("discount_code", {
    id: model.id({ prefix: "disc" }).primaryKey(),
    code: model.text(),
    promotion_id: model.text(),
    discount_type: model.enum(["percentage", "fixed"]).default("percentage"),
    /** percent (0-100) or paise, per discount_type */
    value: model.number(),
    /** minimum total cart units required to apply (0 = no minimum) */
    min_order_units: model.number().default(0),
    /** mirror of the Medusa promotion limit, for admin display (null = unlimited) */
    max_usage: model.number().nullable(),
    expires_at: model.dateTime().nullable(),
    combinable_with_tier: model.boolean().default(false),
    campaign_id: model.text().nullable(),
    active: model.boolean().default(true),
  })
  .indexes([{ on: ["code"], unique: true, where: "deleted_at IS NULL" }])
```

- [ ] **Step 2: Create the service**

`src/modules/discount_code/service.ts`:
```typescript
import { MedusaService } from "@medusajs/framework/utils"
import { DiscountCode } from "./models/discount-code"

class DiscountCodeModuleService extends MedusaService({ DiscountCode }) {
  /** Resolve an active code (case-insensitive). Null if none. */
  async resolveActiveByCode(code: string) {
    const upper = (code ?? "").trim().toUpperCase()
    if (!upper) return null
    const rows = await this.listDiscountCodes({ active: true })
    return rows.find((r) => r.code.trim().toUpperCase() === upper) ?? null
  }

  /** Resolve many codes at once (case-insensitive), for the cart exclusivity check. */
  async resolveActiveByCodes(codes: string[]) {
    const wanted = new Set(
      codes.map((c) => (c ?? "").trim().toUpperCase()).filter(Boolean),
    )
    if (wanted.size === 0) return [] as Awaited<ReturnType<this["listDiscountCodes"]>>
    const rows = await this.listDiscountCodes({ active: true })
    return rows.filter((r) => wanted.has(r.code.trim().toUpperCase()))
  }
}

export default DiscountCodeModuleService
```

- [ ] **Step 3: Create the module index**

`src/modules/discount_code/index.ts`:
```typescript
import { Module } from "@medusajs/framework/utils"
import DiscountCodeModuleService from "./service"

export const DISCOUNT_CODE_MODULE = "discount_code"

export default Module(DISCOUNT_CODE_MODULE, {
  service: DiscountCodeModuleService,
})

export { DiscountCodeModuleService }
```

- [ ] **Step 4: Register in `medusa-config.ts`**

In the `modules: { ... }` block, immediately after the `campaign` entry (`resolve: "./src/modules/campaign"`, ~line 237), add:
```typescript
        discount_code: {
            resolve: "./src/modules/discount_code",
        },
```

- [ ] **Step 5: Generate the migration**

Run: `pnpm exec medusa db:generate discount_code`
Expected: a migration file created under `src/modules/discount_code/migrations/`. Then run `pnpm exec medusa db:migrate` and expect it to apply without error.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm run typecheck`
Expected: no new errors.
```bash
git add src/modules/discount_code medusa-config.ts
git commit -m "feat(discount): discount_code module + migration (FR-6.01)"
```

---

## Task 2: Pure validators (TDD)

**Files:**
- Create: `src/modules/discount_code/validate.ts`
- Test: `src/modules/discount_code/__tests__/validate.test.ts`

- [ ] **Step 1: Write the failing test**

`src/modules/discount_code/__tests__/validate.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { validateDiscountCode } from "../validate"

const base = {
  active: true,
  expires_at: null as Date | null,
  min_order_units: 60,
}

describe("validateDiscountCode", () => {
  it("passes when active, unexpired, and units meet the minimum", () => {
    expect(validateDiscountCode(base, { cartUnits: 60, now: new Date("2026-06-18") }))
      .toEqual({ ok: true })
  })

  it("rejects an inactive code", () => {
    expect(validateDiscountCode({ ...base, active: false }, { cartUnits: 100, now: new Date() }))
      .toEqual({ ok: false, reason: "invalid_code" })
  })

  it("rejects an expired code", () => {
    expect(
      validateDiscountCode(
        { ...base, expires_at: new Date("2026-06-01") },
        { cartUnits: 100, now: new Date("2026-06-18") },
      ),
    ).toEqual({ ok: false, reason: "expired" })
  })

  it("rejects when cart units are below the minimum", () => {
    expect(validateDiscountCode(base, { cartUnits: 59, now: new Date("2026-06-18") }))
      .toEqual({ ok: false, reason: "below_min_units", min: 60, have: 59 })
  })

  it("treats a zero minimum as no minimum", () => {
    expect(validateDiscountCode({ ...base, min_order_units: 0 }, { cartUnits: 1, now: new Date() }))
      .toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/modules/discount_code/__tests__/validate.test.ts`
Expected: FAIL — "Failed to load url ../validate" (module not created yet).

- [ ] **Step 3: Write the implementation**

`src/modules/discount_code/validate.ts`:
```typescript
export type DiscountCodeFacts = {
  active: boolean
  expires_at: Date | string | null
  min_order_units: number
}

export type ValidateContext = { cartUnits: number; now: Date }

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: "invalid_code" | "expired" | "usage_exhausted" }
  | { ok: false; reason: "below_min_units"; min: number; have: number }

/**
 * Pure pre-apply check for a discount code. Usage-limit ("usage_exhausted") is
 * NOT decided here — that's owned by Medusa's native promotion limit and
 * surfaced by updateCartPromotionsWorkflow; this covers active/expiry/min-units.
 */
export function validateDiscountCode(
  code: DiscountCodeFacts,
  ctx: ValidateContext,
): ValidationResult {
  if (!code.active) return { ok: false, reason: "invalid_code" }
  if (code.expires_at && new Date(code.expires_at) < ctx.now) {
    return { ok: false, reason: "expired" }
  }
  const min = Number(code.min_order_units ?? 0)
  if (min > 0 && ctx.cartUnits < min) {
    return { ok: false, reason: "below_min_units", min, have: ctx.cartUnits }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/modules/discount_code/__tests__/validate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/discount_code/validate.ts src/modules/discount_code/__tests__/validate.test.ts
git commit -m "feat(discount): pure discount-code validators + tests (FR-6.01)"
```

---

## Task 3: Admin create/list endpoint

**Files:**
- Create: `src/api/admin/discount-codes/route.ts`
- Reference pattern: any existing `src/api/admin/*/route.ts` (Zod body, `req.scope.resolve`).

- [ ] **Step 1: Write the route**

`src/api/admin/discount-codes/route.ts`:
```typescript
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createPromotionsWorkflow } from "@medusajs/core-flows"
import {
  DISCOUNT_CODE_MODULE,
  type DiscountCodeModuleService,
} from "../../../modules/discount_code"
import { CAMPAIGN_MODULE } from "../../../modules/campaign"
import type { CampaignModuleService } from "../../../modules/campaign"

const BodySchema = z.object({
  code: z.string().trim().min(2).max(40).transform((v) => v.toUpperCase()),
  discount_type: z.enum(["percentage", "fixed"]),
  // percent 0-100, or paise for fixed
  value: z.number().int().positive(),
  min_order_units: z.number().int().min(0).default(0),
  max_usage: z.number().int().positive().nullable().default(null),
  expires_at: z.string().datetime().nullable().default(null),
  combinable_with_tier: z.boolean().default(false),
  track_as_campaign: z.boolean().default(false),
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() })
  }
  const d = parsed.data

  // 1. Create the Medusa promotion (discount math + native usage limit).
  const { result } = await createPromotionsWorkflow(req.scope).run({
    input: {
      promotionsData: [
        {
          code: d.code,
          type: "standard",
          status: "active",
          limit: d.max_usage ?? undefined,
          application_method: {
            type: d.discount_type, // "percentage" | "fixed"
            target_type: "order",
            allocation: "across",
            value: d.value,
            ...(d.discount_type === "fixed" ? { currency_code: "inr" } : {}),
          },
        },
      ],
    },
  })
  const promotion = (result as Array<{ id: string }>)[0]

  // 2. Optionally ensure a marketing_campaign with the same code exists.
  let campaignId: string | null = null
  if (d.track_as_campaign) {
    const campaigns = req.scope.resolve<CampaignModuleService>(CAMPAIGN_MODULE)
    const existing = await campaigns.resolveActiveByCode(d.code)
    if (existing) {
      campaignId = existing.id
    } else {
      const [created] = await campaigns.createCampaigns([
        { code: d.code, name: d.code, starts_at: new Date(), active: true },
      ])
      campaignId = created.id
    }
  }

  // 3. Persist the PIX record.
  const svc = req.scope.resolve<DiscountCodeModuleService>(DISCOUNT_CODE_MODULE)
  const [record] = await svc.createDiscountCodes([
    {
      code: d.code,
      promotion_id: promotion.id,
      discount_type: d.discount_type,
      value: d.value,
      min_order_units: d.min_order_units,
      max_usage: d.max_usage,
      expires_at: d.expires_at ? new Date(d.expires_at) : null,
      combinable_with_tier: d.combinable_with_tier,
      campaign_id: campaignId,
      active: true,
    },
  ])

  return res.json({ discount_code: record })
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve<DiscountCodeModuleService>(DISCOUNT_CODE_MODULE)
  const discount_codes = await svc.listDiscountCodes({})
  return res.json({ discount_codes })
}
```

> Note: confirm the campaign module exposes `createCampaigns` (auto-generated by `MedusaService({ Campaign })`). If the generated name differs, adjust. The `Campaign` model requires `code`, `name`, `starts_at`, `active` (see `src/modules/campaign/models/campaign.ts`).

- [ ] **Step 2: Register admin auth (see Task 5), then verify**

After Task 5, with the backend running:
Run:
```bash
curl -sS -X POST http://localhost:9000/admin/discount-codes \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"code":"GARTEX2026","discount_type":"percentage","value":10,"min_order_units":120,"max_usage":100,"combinable_with_tier":true,"track_as_campaign":true}'
```
Expected: `200` with `{ "discount_code": { "id": "disc_...", "code": "GARTEX2026", ... } }`. Then `GET /admin/discount-codes` lists it.

- [ ] **Step 3: Commit**

```bash
git add src/api/admin/discount-codes/route.ts
git commit -m "feat(discount): admin create/list discount-codes endpoint (FR-6.01)"
```

---

## Task 4: Admin delete endpoint

**Files:**
- Create: `src/api/admin/discount-codes/[id]/route.ts`

- [ ] **Step 1: Write the route**

`src/api/admin/discount-codes/[id]/route.ts`:
```typescript
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  DISCOUNT_CODE_MODULE,
  type DiscountCodeModuleService,
} from "../../../../modules/discount_code"

// Soft-deactivate the PIX record. The Medusa promotion is left in place
// (its native limit still applies); deactivating here makes the code
// unresolvable by the store apply endpoint.
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve<DiscountCodeModuleService>(DISCOUNT_CODE_MODULE)
  await svc.updateDiscountCodes({ id: req.params.id, active: false })
  return res.json({ id: req.params.id, deleted: true })
}
```

- [ ] **Step 2: Verify**

Run: `curl -sS -X DELETE http://localhost:9000/admin/discount-codes/<id> -H "Authorization: Bearer $ADMIN_TOKEN"`
Expected: `200 {"id":"<id>","deleted":true}`; the code no longer applies at checkout.

- [ ] **Step 3: Commit**

```bash
git add "src/api/admin/discount-codes/[id]/route.ts"
git commit -m "feat(discount): admin deactivate discount-code endpoint (FR-6.01)"
```

---

## Task 5: Register route middlewares

**Files:**
- Modify: `src/api/middlewares.ts`

- [ ] **Step 1: Add matchers**

Find the `routes: [ ... ]` array. Add an admin matcher (alongside the other `authenticate("user", ...)` entries) and a store matcher (alongside `authenticate("customer", ...)` entries):
```typescript
      {
        matcher: "/admin/discount-codes*",
        middlewares: [authenticate("user", ["session", "bearer"])],
      },
      {
        matcher: "/store/carts/:id/discount-code",
        middlewares: [authenticate("customer", ["session", "bearer"])],
      },
```
(Match the exact `authenticate` import/signature already used in the file.)

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm run typecheck`
Expected: no new errors.
```bash
git add src/api/middlewares.ts
git commit -m "feat(discount): register discount-code route auth (FR-6.01)"
```

---

## Task 6: Store apply / remove endpoint

**Files:**
- Create: `src/api/store/carts/[id]/discount-code/route.ts`
- Reference: `src/api/store/carts/[id]/wallet-apply/route.ts` (cart ownership + auth context pattern).

- [ ] **Step 1: Write the route**

`src/api/store/carts/[id]/discount-code/route.ts`:
```typescript
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, PromotionActions } from "@medusajs/framework/utils"
import { updateCartPromotionsWorkflow } from "@medusajs/core-flows"
import { z } from "zod"
import {
  DISCOUNT_CODE_MODULE,
  type DiscountCodeModuleService,
} from "../../../../../modules/discount_code"
import { validateDiscountCode } from "../../../../../modules/discount_code/validate"

const BodySchema = z.object({
  code: z.string().trim().min(1).transform((v) => v.toUpperCase()),
})

async function cartUnits(scope: MedusaRequest["scope"], cartId: string): Promise<number> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "items.quantity"],
    filters: { id: cartId },
  })
  const items = (carts?.[0]?.items ?? []) as Array<{ quantity?: number }>
  return items.reduce((s, it) => s + Number(it.quantity ?? 0), 0)
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ ok: false, reason: "invalid_code" })
  }

  const svc = req.scope.resolve<DiscountCodeModuleService>(DISCOUNT_CODE_MODULE)
  const code = await svc.resolveActiveByCode(parsed.data.code)
  if (!code) return res.status(404).json({ ok: false, reason: "invalid_code" })

  const units = await cartUnits(req.scope, cartId)
  const check = validateDiscountCode(
    { active: code.active, expires_at: code.expires_at, min_order_units: code.min_order_units },
    { cartUnits: units, now: new Date() },
  )
  if (!check.ok) return res.status(409).json(check)

  // Apply the Medusa promotion; it reports native limit/budget rejections.
  const { result } = await updateCartPromotionsWorkflow(req.scope).run({
    input: { cart_id: cartId, promo_codes: [code.code], action: PromotionActions.ADD },
  })
  const skipped = (result as { skipped_promo_codes?: Array<{ code: string; reason?: string }> })
    ?.skipped_promo_codes ?? []
  if (skipped.length > 0) {
    return res.status(409).json({ ok: false, reason: "usage_exhausted", detail: skipped })
  }

  return res.json({ ok: true, code: code.code })
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const code = (req.query.code as string | undefined)?.toUpperCase()
  await updateCartPromotionsWorkflow(req.scope).run({
    input: {
      cart_id: cartId,
      promo_codes: code ? [code] : [],
      action: PromotionActions.REMOVE,
    },
  })
  return res.json({ ok: true })
}
```

> Note: if `PromotionActions` is not exported from `@medusajs/framework/utils` in this version, import from `@medusajs/utils` (the explorer found it under utils). Verify the import resolves during typecheck.

- [ ] **Step 2: Verify (backend running, authenticated customer cart)**

Run (apply below-min, expect 409):
```bash
curl -sS -X POST http://localhost:9000/store/carts/$CART/discount-code \
  -H "Content-Type: application/json" -H "Authorization: Bearer $CUST" \
  -H "x-publishable-api-key: $PUB" -d '{"code":"GARTEX2026"}'
```
Expected with a cart under the min: `409 {"ok":false,"reason":"below_min_units","min":120,"have":<n>}`.
With a qualifying cart: `200 {"ok":true,"code":"GARTEX2026"}` and the cart's `discount_total`/`total` reflect the discount on retrieve.

- [ ] **Step 3: Commit**

```bash
git add "src/api/store/carts/[id]/discount-code/route.ts"
git commit -m "feat(discount): store apply/remove discount-code endpoint (FR-6.01)"
```

---

## Task 7: Repoint cart exclusivity to the module

**Files:**
- Modify: `src/lib/b2b-cart.ts` (the FR-6.04 exclusivity block, lines ~134-149)

- [ ] **Step 1: Replace the metadata read with a module lookup**

Replace:
```typescript
  if (isB2B) {
    for (const p of cart.promotions ?? []) {
      const combinable =
        (p?.metadata as any)?.combinable_with_tier === true
      if (!p?.is_automatic && !combinable) {
        violations.push({
          type: "promo_tier_conflict",
          message: `Promo code "${p?.code ?? ""}" can't be combined with your wholesale tier pricing.`,
        })
      }
    }
  }
```
with:
```typescript
  if (isB2B) {
    const codes = (cart.promotions ?? [])
      .filter((p) => !p?.is_automatic)
      .map((p) => p?.code ?? "")
      .filter(Boolean)
    if (codes.length > 0) {
      const discSvc = scope.resolve(DISCOUNT_CODE_MODULE) as {
        resolveActiveByCodes: (
          c: string[],
        ) => Promise<Array<{ code: string; combinable_with_tier: boolean }>>
      }
      const records = await discSvc.resolveActiveByCodes(codes)
      const combinable = new Map(
        records.map((r) => [r.code.trim().toUpperCase(), r.combinable_with_tier]),
      )
      for (const p of cart.promotions ?? []) {
        if (p?.is_automatic) continue
        const ok = combinable.get((p?.code ?? "").trim().toUpperCase()) === true
        if (!ok) {
          violations.push({
            type: "promo_tier_conflict",
            message: `Promo code "${p?.code ?? ""}" can't be combined with your wholesale tier pricing.`,
          })
        }
      }
    }
  }
```
And add the import at the top of the file:
```typescript
import { DISCOUNT_CODE_MODULE } from "../modules/discount_code"
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm run typecheck`
Expected: no new errors.
```bash
git add src/lib/b2b-cart.ts
git commit -m "feat(discount): resolve combinable_with_tier from discount_code module (FR-6.01/6.04)"
```

---

## Task 8: Admin screen

**Files:**
- Create: `src/admin/routes/discount-codes/page.tsx`
- Reference pattern: `src/admin/routes/b2b-sales/page.tsx` (defineRouteConfig + `@medusajs/ui` + fetch to `/admin/...`).

- [ ] **Step 1: Write the page**

`src/admin/routes/discount-codes/page.tsx`:
```tsx
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Tag } from "@medusajs/icons"
import {
  Button, Container, Heading, Input, Label, Select, Switch, Table, Text, toast,
} from "@medusajs/ui"
import React, { useCallback, useEffect, useState } from "react"

const BASE = "/admin/discount-codes"

type DiscountCode = {
  id: string
  code: string
  discount_type: "percentage" | "fixed"
  value: number
  min_order_units: number
  max_usage: number | null
  expires_at: string | null
  combinable_with_tier: boolean
  active: boolean
}

const empty = {
  code: "",
  discount_type: "percentage" as "percentage" | "fixed",
  value: "10",
  min_order_units: "0",
  max_usage: "",
  expires_at: "",
  combinable_with_tier: false,
  track_as_campaign: false,
}

const DiscountCodesPage = () => {
  const [rows, setRows] = useState<DiscountCode[]>([])
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(BASE, { credentials: "include" })
    const body = await res.json()
    setRows(body.discount_codes ?? [])
  }, [])

  useEffect(() => { void load() }, [load])

  const create = async () => {
    setSaving(true)
    try {
      const res = await fetch(BASE, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          discount_type: form.discount_type,
          value: Number(form.value),
          min_order_units: Number(form.min_order_units || 0),
          max_usage: form.max_usage ? Number(form.max_usage) : null,
          expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
          combinable_with_tier: form.combinable_with_tier,
          track_as_campaign: form.track_as_campaign,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).message ?? "Failed")
      toast.success(`Created ${form.code}`)
      setForm(empty)
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    await fetch(`${BASE}/${id}`, { method: "DELETE", credentials: "include" })
    await load()
  }

  return (
    <Container>
      <Heading level="h1">Discount codes</Heading>
      <div className="mt-4 grid grid-cols-2 gap-3 max-w-2xl">
        <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
        <div><Label>Type</Label>
          <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v as "percentage" | "fixed" })}>
            <Select.Trigger><Select.Value /></Select.Trigger>
            <Select.Content>
              <Select.Item value="percentage">% off</Select.Item>
              <Select.Item value="fixed">₹ off (paise)</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div><Label>Value</Label><Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
        <div><Label>Min order units</Label><Input type="number" value={form.min_order_units} onChange={(e) => setForm({ ...form, min_order_units: e.target.value })} /></div>
        <div><Label>Max usage (blank = unlimited)</Label><Input type="number" value={form.max_usage} onChange={(e) => setForm({ ...form, max_usage: e.target.value })} /></div>
        <div><Label>Expires at</Label><Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
        <div className="flex items-center gap-2"><Switch checked={form.combinable_with_tier} onCheckedChange={(v) => setForm({ ...form, combinable_with_tier: v })} /><Text>Combine with tier pricing</Text></div>
        <div className="flex items-center gap-2"><Switch checked={form.track_as_campaign} onCheckedChange={(v) => setForm({ ...form, track_as_campaign: v })} /><Text>Track as campaign</Text></div>
      </div>
      <Button className="mt-3" onClick={create} isLoading={saving} disabled={!form.code}>Create code</Button>

      <Table className="mt-6">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Code</Table.HeaderCell>
            <Table.HeaderCell>Discount</Table.HeaderCell>
            <Table.HeaderCell>Min units</Table.HeaderCell>
            <Table.HeaderCell>Combinable</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((r) => (
            <Table.Row key={r.id}>
              <Table.Cell>{r.code}</Table.Cell>
              <Table.Cell>{r.discount_type === "percentage" ? `${r.value}%` : `₹${(r.value / 100).toFixed(2)}`}</Table.Cell>
              <Table.Cell>{r.min_order_units}</Table.Cell>
              <Table.Cell>{r.combinable_with_tier ? "yes" : "no"}</Table.Cell>
              <Table.Cell><Button variant="secondary" size="small" onClick={() => remove(r.id)}>Deactivate</Button></Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Discount codes", icon: Tag })

export default DiscountCodesPage
```

- [ ] **Step 2: Verify**

Run: `pnpm run build` (admin builds). Expected: no errors. With the backend running, the "Discount codes" item appears in the admin sidebar; creating a code adds a row and it appears via `GET /admin/discount-codes`.

- [ ] **Step 3: Commit**

```bash
git add src/admin/routes/discount-codes/page.tsx
git commit -m "feat(discount): admin discount-codes screen (FR-6.01)"
```

---

## Task 9: Storefront apply client (TDD the error mapping)

**Files:** (`risitex/apps/storefront`)
- Create: `src/lib/discount-code.ts`
- Test: `src/lib/__tests__/discount-code.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/discount-code.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { discountErrorMessage } from "../discount-code"

describe("discountErrorMessage", () => {
  it("maps each reason to a buyer-friendly message", () => {
    expect(discountErrorMessage("invalid_code")).toMatch(/not.*valid|invalid/i)
    expect(discountErrorMessage("expired")).toMatch(/expired/i)
    expect(discountErrorMessage("usage_exhausted")).toMatch(/limit|used up/i)
  })

  it("includes the minimum in the below-min message", () => {
    expect(discountErrorMessage("below_min_units", { min: 120, have: 60 }))
      .toMatch(/120/)
  })

  it("falls back for an unknown reason", () => {
    expect(discountErrorMessage("something_else")).toMatch(/couldn.t apply|try again/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/__tests__/discount-code.test.ts` (from `apps/storefront`)
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/discount-code.ts`:
```typescript
import { MEDUSA_BASE_URL } from "@/lib/medusa"

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""

export type DiscountReason =
  | "invalid_code" | "expired" | "below_min_units" | "usage_exhausted" | string

export function discountErrorMessage(
  reason: DiscountReason,
  detail?: { min?: number; have?: number },
): string {
  switch (reason) {
    case "invalid_code":
      return "That code isn’t valid."
    case "expired":
      return "That code has expired."
    case "below_min_units":
      return `That code needs at least ${detail?.min ?? "more"} units in the cart.`
    case "usage_exhausted":
      return "That code has reached its usage limit."
    default:
      return "Couldn’t apply that code — please try again."
  }
}

export async function applyDiscountCode(
  cartId: string,
  code: string,
  authHeader?: Record<string, string>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`${MEDUSA_BASE_URL}/store/carts/${cartId}/discount-code`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "x-publishable-api-key": PUB_KEY, ...(authHeader ?? {}) },
    body: JSON.stringify({ code }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean; reason?: string; min?: number; have?: number
  }
  if (res.ok && body.ok) return { ok: true }
  return { ok: false, message: discountErrorMessage(body.reason ?? "", body) }
}

export async function removeDiscountCode(
  cartId: string,
  code: string,
  authHeader?: Record<string, string>,
): Promise<void> {
  await fetch(
    `${MEDUSA_BASE_URL}/store/carts/${cartId}/discount-code?code=${encodeURIComponent(code)}`,
    { method: "DELETE", credentials: "include", headers: { "x-publishable-api-key": PUB_KEY, ...(authHeader ?? {}) } },
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/__tests__/discount-code.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discount-code.ts src/lib/__tests__/discount-code.test.ts
git commit -m "feat(storefront): discount-code apply client + tests (FR-6.01)"
```

---

## Task 10: Wholesale checkout promo-code input

**Files:** (`risitex/apps/storefront`)
- Modify: `src/app/checkout/wholesale/page.tsx`

- [ ] **Step 1: Add state + handlers (near the other cart/total state, after `checkoutCart`)**

```tsx
import { applyDiscountCode, removeDiscountCode } from "@/lib/discount-code";
// ...
const [promoInput, setPromoInput] = React.useState("");
const [appliedCode, setAppliedCode] = React.useState<string | null>(null);
const [promoError, setPromoError] = React.useState<string | null>(null);
const [promoBusy, setPromoBusy] = React.useState(false);

const applyPromo = async () => {
  const cartId = checkoutCart.cart?.cart_id;
  if (!cartId || !promoInput.trim()) return;
  setPromoBusy(true);
  setPromoError(null);
  const r = await applyDiscountCode(cartId, promoInput.trim());
  if (r.ok) {
    setAppliedCode(promoInput.trim().toUpperCase());
    setPromoInput("");
    // refresh totals (the existing address-sync effect reads cart totals;
    // re-trigger by re-reading the cart here):
    try {
      const { cart } = await medusa().store.cart.retrieve(cartId, {
        fields: "id,total,subtotal,item_subtotal,tax_total,item_tax_total,discount_total",
      } as Record<string, unknown>);
      const c = cart as unknown as { item_subtotal?: number; subtotal?: number; tax_total?: number; item_tax_total?: number; total?: number };
      setCartTotals({
        subtotalPaise: Math.round(Number(c.item_subtotal ?? c.subtotal ?? 0)),
        taxPaise: Math.round(Number(c.item_tax_total ?? c.tax_total ?? 0)),
        totalPaise: Math.round(Number(c.total ?? 0)),
      });
    } catch { /* leave estimate */ }
  } else {
    setPromoError(r.message);
  }
  setPromoBusy(false);
};

const clearPromo = async () => {
  const cartId = checkoutCart.cart?.cart_id;
  if (!cartId || !appliedCode) return;
  await removeDiscountCode(cartId, appliedCode);
  setAppliedCode(null);
};
```

- [ ] **Step 2: Add the input + applied-code row to the order summary** (just above the `<Row label="Total" ...>`)

```tsx
                <div className="flex items-center gap-2 pt-2">
                  <Input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.currentTarget.value.toUpperCase())}
                    placeholder="Promo code"
                    aria-label="Promo code"
                  />
                  <Button size="sm" variant="secondary" onClick={applyPromo} isLoading={promoBusy} disabled={!promoInput.trim()}>
                    Apply
                  </Button>
                </div>
                {promoError && (
                  <p className="text-caption text-feedback-danger-text">{promoError}</p>
                )}
                {appliedCode && (
                  <Row
                    label={`Code · ${appliedCode}`}
                    value={
                      <button type="button" onClick={clearPromo} className="text-caption underline">
                        remove
                      </button> as unknown as string
                    }
                  />
                )}
```
> Ensure `Input` is imported in this file (it already imports from `@risitex/ui/components`). If `Row`'s `value` prop is typed `string`, render the applied-code line as plain JSX instead of via `Row`, e.g. a `<div className="flex justify-between text-body-sm">…</div>` matching `Row`'s markup.

- [ ] **Step 3: Verify**

Run: `pnpm run typecheck` (from `apps/storefront`). Expected: no new errors in `checkout/wholesale/page.tsx`.
Then, with backend running and a code created, smoke-check `http://localhost:3000/checkout/wholesale` returns 200 and applying a valid code lowers the displayed total; an invalid/below-min code shows the mapped error.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/app/checkout/wholesale/page.tsx
git commit -m "feat(storefront): promo-code input in wholesale checkout (FR-6.01)"
```

---

## Self-review notes (author)

- **Spec coverage:** min order units (Task 2/6), max usage (native `limit`, Task 3; surfaced Task 6), expiry (Task 2/6), admin generation (Tasks 3/8), apply at checkout (Tasks 6/9/10), unified campaign (Task 3 + existing subscriber), combinable_with_tier interaction (Tasks 1/3/7). Covered.
- **Unverified Medusa specifics (confirm during execution):** `createPromotionsWorkflow` `limit` field name; `PromotionActions` import path (`@medusajs/framework/utils` vs `@medusajs/utils`); auto-generated service method names (`createDiscountCodes`, `updateDiscountCodes`, `createCampaigns`); `db:generate` migration command. Each task's typecheck/curl step catches mismatches early.
- **Out of scope:** FR-6.03 automatic volume discounts; FR-6.04 stacking matrix beyond the combinable flag.
