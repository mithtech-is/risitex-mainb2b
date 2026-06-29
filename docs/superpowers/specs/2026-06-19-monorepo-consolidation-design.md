# RISITEX Monorepo Consolidation — Design

- **Date:** 2026-06-19
- **Branch:** `chore/monorepo-consolidation`
- **Status:** Approved design, pending implementation plan

## Problem

The `risitex` desktop folder is two separate git repositories, one accidentally
nested inside the other:

- **`risitex/`** (outer) — a pnpm monorepo: `apps/storefront`, `apps/backend`
  (an older Medusa backend), `packages/{shared,ui}`, `infrastructure/`, `docs/`,
  `scripts/`. No git remote.
- **`risitex/risitex-v2/`** (nested) — a second, feature-rich Medusa backend
  (Polemarch-derived: `b2b_pricing`, ERPNext plugin, wallet, OTP auth, etc.)
  with its **own `.git`**. No git remote.

`risitex-v2` is currently staged in the outer repo as a gitlink (mode `160000`).
Committing/pushing that would publish `risitex-v2` to GitHub as a dead,
un-clickable submodule pointer with none of its files visible.

The goal: one clean GitHub repo where storefront + backend are properly placed
and anyone landing on the repo immediately understands the layout.

## Decisions

1. **One monorepo** — a single GitHub repo containing everything.
2. **v2 is the canonical backend** — it becomes `apps/backend`. Confirmed by
   evidence: the storefront calls 51 custom endpoints, and all of the B2B,
   wallet, OTP, rep/affiliate, saved-cart, shipments, credit-terms, and
   purchase-order routes exist **only in v2**. The storefront is already built
   against v2; the old `apps/backend` exposes just 6 `/store/` routes.
3. **Port three modules** from the old backend into v2:
   `product-questions` (mandatory — storefront depends on it),
   plus `rbac` and `warehouse` (admin-only, user opted to keep both).
4. **Drop everything else** in the old backend. Its `moq`, `matrix-ordering`,
   `master-carton`, `company`, `logistics`, `affiliate`, `commission`,
   `sales-rep`, `customer-tier`, and `erp-sync` modules are **superseded by
   v2's richer equivalents** — copying them in would create duplicate,
   conflicting modules.
5. **Delete the old backend entirely** after porting. No permanent legacy folder.
6. **History is preserved** as `.bundle` files outside the repo plus a
   pre-consolidation git tag, so dropped modules remain recoverable forever.

### Why these three modules (comparison summary)

| Old module | v2 equivalent | Storefront dep | Verdict |
|---|---|---|---|
| product-questions | none | **`GET/POST /store/product-questions`** | **PORT (mandatory)** |
| rbac | none (v2 uses native roles + company/tier) | no | PORT (user choice) |
| warehouse | none (v2 logistics = shipment tracking only) | no | PORT (user choice) |
| moq | `b2b_pricing` (ProductQuantityRule) | via v2 `/store/b2b-sales/...` | drop |
| matrix-ordering | `matrix_order` | via v2 | drop |
| master-carton | `master_carton` | via v2 | drop |
| company | `company` (v2 has `/store/companies/*`) | via v2 | drop |
| logistics | `logistics` (v2 has `/store/shipments`) | via v2 | drop |
| affiliate / commission / sales-rep | `sales_performance` | via v2 `/store/rep/me`, `/store/referral` | drop |
| customer-tier | `customer_tier` | admin-only | drop |
| erp-sync | `@polemarch/medusa-plugin-erpnext` | n/a | drop |

## Target structure

```
risitex/                              ← single repo
├── README.md                         ← rewritten: what RISITEX is + structure map + quickstart
├── apps/
│   ├── storefront/                   ← Next.js storefront (unchanged)
│   └── backend/                      ← v2 backend, renamed @risitex/backend
│       ├── src/                      ← v2 modules + ported product-questions, rbac, warehouse
│       ├── migrations/               ← v2 raw SQL migrations
│       ├── packages/medusa-plugin-erpnext/   ← self-contained (file: dependency)
│       ├── Dockerfile · render.yaml · vitest.config.ts · docs/
│       └── package.json · tsconfig.json
├── packages/{shared,ui}/
├── infrastructure/{docker,postgres}/
├── docs/{architecture,research,superpowers}/
├── scripts/{dev.ps1,reset.ps1}
└── package.json · pnpm-workspace.yaml · turbo.json · tsconfig.base.json · .gitignore · .editorconfig · .npmrc
```

After consolidation: `pnpm install && pnpm dev` boots storefront (:3000) and
backend (:9000) together via turbo.

## Plan (phased)

### Phase 0 — Branch & safety net
- Create branch `chore/monorepo-consolidation`.
- `git rm --cached risitex-v2` to remove the broken gitlink from the index.
- `git bundle create ../risitex-v2-history.bundle --all` inside `risitex-v2`
  (saved outside the repo).
- Tag the outer repo's pre-consolidation HEAD (preserves the old backend code).

### Phase 1 — Port the three modules into v2 (both backends still intact)
For each of `product-questions`, `rbac`, `warehouse`, copy from old
`apps/backend` into `risitex-v2`:

- **product-questions**
  - `src/modules/product-questions/` (model, service, `migrations/Migration20260618055442.ts`)
  - `src/api/store/product-questions/route.ts`
  - `src/api/admin/product-questions/route.ts`
- **rbac**
  - `src/modules/rbac/` (Role, RolePermission, UserRole; `migrations/Migration20260610110804.ts`)
  - `src/api/admin/roles/**`, `src/api/admin/user-roles/**`, `src/api/admin/permission-check/`
  - `src/admin/routes/roles/**`, `src/admin/routes/user-roles/`
- **warehouse**
  - `src/modules/warehouse/` (WarehouseProfile; `migrations/Migration20260610105808.ts`)
  - `src/api/admin/warehouse-profiles/**`
  - `src/admin/routes/warehouse-profiles/`

Then:
- Register all three modules in v2's `medusa-config.ts`.
- Bring over / adapt the `src/admin/lib` helpers the rbac & warehouse admin
  pages import, fitting v2's admin conventions (avoid name collisions).
- Merge any rbac middleware into v2's existing `src/api/middlewares.ts`
  (do not overwrite — v2 uses it for `password_history`).
- Keep all URL paths identical so the storefront needs zero changes.

**Verify:** v2 boots; `medusa db:migrate` applies the 3 new migrations;
`/store/product-questions` responds; the rbac & warehouse admin pages render.

### Phase 2 — Physical consolidation
- Delete old `apps/backend`.
- Move `risitex-v2`'s contents into `apps/backend/`.
- Remove v2's inner `.git`.
- Rename package `medusa-polemarch-backend` → `@risitex/backend`.
- Delete v2's standalone `pnpm-lock.yaml` (root workspace lock takes over).
- Run one root `pnpm install` to relink the workspace.
- Keep `apps/backend/packages/medusa-plugin-erpnext` self-contained with its
  existing `file:./packages/medusa-plugin-erpnext` reference.

**Verify:** `pnpm --filter @risitex/backend build` succeeds; backend boots on
:9000; storefront builds; product Q&A form + a couple of B2B calls work
end-to-end.

### Phase 3 — GitHub-clarity cleanup
- Rewrite root `README.md`: project summary, structure map, prerequisites,
  copy-paste quickstart (`pnpm install` → `pnpm docker:up` → `pnpm dev`),
  and a setup note about the machine-specific cashfree-wallet `file:` path
  (`C:/Users/KillerKoli/ayush/...`).
- Move the brand-research PDF → `docs/research/`.
- Confirm `node_modules`, `dist`, `.medusa`, `*.log`, `.env*` (except
  `.env.example`) are gitignored across the tree and not tracked.

## Risks & mitigations

- **Admin UI port (highest risk)** — rbac/warehouse pages depend on the old
  backend's `src/admin/lib` helpers. Mitigation: port the specific helpers (or
  rebuild minimal pages in v2's style) and verify each page renders before
  Phase 2.
- **Middleware merge** — merge rbac middleware into v2's `middlewares.ts`
  rather than overwriting.
- **Lockfile / dependency drift** — a clean root `pnpm install` regenerates a
  single lock; verify the cashfree-wallet and erpnext `file:` deps resolve.
- **Irreversibility** — nothing is deleted before Phase 1/2 verification passes,
  and history bundles + the git tag make even the dropped modules recoverable.

## Out of scope

- Setting up a GitHub remote / pushing (deferred per project notes).
- Porting any old-backend module other than the three named above.
- Refactoring v2's existing modules.
- Renaming the erpnext plugin to `@risitex/...` (a separate, later task).

## Verification criteria (definition of done)

1. Single git repo, no nested `.git`, no `160000` gitlink in the index.
2. `apps/backend` is the v2 backend, named `@risitex/backend`, and boots on :9000.
3. The three ported modules' migrations apply and their endpoints/pages work.
4. Storefront builds and its custom calls (incl. product Q&A) succeed against
   the backend.
5. Root `README.md` documents the structure and quickstart.
6. No secrets, `node_modules`, build output, or logs tracked in git.
7. History bundles + pre-consolidation tag exist and are verified loadable.
