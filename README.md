# RISITEX

> B2B + B2C textile ecommerce platform — **MedusaJS 2.0** backend, **Next.js 15** storefront, in a single pnpm + Turborepo monorepo.

Internal project of **Mithtech Innovative Solutions**. Closed source.

---

## Stack at a glance

| Layer        | Tech                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| Backend      | MedusaJS 2.0, PostgreSQL 16, Redis 7 (event bus / cache / workflow engine / locking)          |
| Storefront   | Next.js 15, TypeScript, TailwindCSS, Zustand, TanStack Query, React Hook Form, Zod             |
| Monorepo     | pnpm workspaces + Turborepo                                                                    |
| Local infra  | Docker Compose (Postgres + Redis)                                                              |
| Integrations | ERPNext (workspace plugin), Razorpay, Cashfree wallet, MSG91 SMS, WhatsApp, SMTP email         |

---

## Repository structure

```
risitex/
├── apps/
│   ├── backend/              # MedusaJS 2.0 server — API + admin dashboard (:9000, admin at :9000/app)
│   │   ├── src/
│   │   │   ├── modules/      # ~30 custom domain modules (b2b_pricing, cashfree_wallet, company,
│   │   │   │                 #   matrix_order, master_carton, logistics, rbac, warehouse, …)
│   │   │   ├── api/          # store + admin HTTP routes (+ middlewares.ts)
│   │   │   ├── admin/        # admin dashboard UI extensions (widgets, routes)
│   │   │   ├── workflows/ · subscribers/ · jobs/ · links/
│   │   │   └── scripts/      # seed + maintenance scripts
│   │   ├── packages/medusa-plugin-erpnext/   # ERPNext (Frappe) sync — workspace plugin
│   │   ├── medusa-config.ts · tsconfig.json
│   │   └── .env.example      # copy to .env and fill in
│   └── storefront/           # Next.js 15 customer-facing site (:3000)
│       └── .env.example      # copy to .env.local and fill in
├── packages/
│   ├── shared/               # shared TypeScript types / Zod schemas
│   └── ui/                   # shared React components
├── infrastructure/docker/    # docker-compose.yml (Postgres + Redis)
├── docs/                     # architecture notes, research, specs
├── scripts/                  # cross-cutting dev/ops scripts (dev.ps1, reset.ps1)
├── package.json · pnpm-workspace.yaml · turbo.json · tsconfig.base.json
```

---

## Prerequisites

- **Node ≥ 20** (22 recommended)
- **pnpm ≥ 9** (`npm i -g pnpm`)
- **Docker Desktop** (for local Postgres + Redis)
- ~2 GB free RAM to run the dev stack (backend ≈ 800 MB, storefront ≈ 600 MB)

> ⚠️ **TypeScript must stay on the 5.x line.** The backend is built against
> TypeScript **5.9.x**. Do **not** bump `apps/backend` to TypeScript 6.x — it is
> incompatible with Medusa 2.15 and sends the type-checker into runaway recursion
> that OOMs the dev server on boot. See [Troubleshooting](#troubleshooting).

---

## Quickstart

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Start Postgres + Redis locally (Docker)
pnpm docker:up

# 3. Configure environment (see "Environment" below)
#    backend:    cp apps/backend/.env.example    apps/backend/.env       # then fill in secrets
#    storefront: cp apps/storefront/.env.example apps/storefront/.env.local

# 4. Apply database migrations (Medusa modules + raw SQL)
pnpm --filter @risitex/backend exec medusa db:migrate

# 5a. Run the backend  (API + admin)        → http://localhost:9000  ·  admin http://localhost:9000/app
pnpm --filter @risitex/backend dev

# 5b. Run the storefront (separate terminal) → http://localhost:3000
pnpm --filter @risitex/storefront dev

#  …or run BOTH together via Turbo:
pnpm dev
```

The backend boots in ~15–20 s (~800 MB). The first request to `/app` triggers the
admin's Vite dev server to compile (a few seconds), after which the dashboard loads.

---

## Environment

### Backend — `apps/backend/.env`

Copy `apps/backend/.env.example` → `apps/backend/.env`. The Postgres/Redis URLs in
the example already match the Docker Compose defaults (Postgres host port **5435**,
Redis host port **16380**). You must set four security secrets — generate each with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

| Var                     | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`          | `postgresql://risitex:…@localhost:5435/risitex_v2`               |
| `REDIS_URL`             | `redis://localhost:16380`                                        |
| `JWT_SECRET`            | strong random — backend rejects weak values                     |
| `COOKIE_SECRET`         | strong random                                                   |
| `AT_REST_ENCRYPTION_KEY`| ≥16 chars, encrypts DB-stored credentials                        |
| `OTP_PEPPER`            | server-wide pepper for phone-OTP hashing                         |
| `STORE_CORS` / `AUTH_CORS` | must include `http://localhost:3000` for the storefront       |

Payment / ERPNext / Porter / Jira keys are optional for local dev — the providers
run in pass-through/dev mode when blank. `.env` is git-ignored; never commit it.

### Storefront — `apps/storefront/.env.local`

Copy `apps/storefront/.env.example` → `apps/storefront/.env.local`:

```
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_…
```

Get the publishable key from the Medusa admin (**Settings → Publishable API Keys**)
after the backend is running, or reuse the default one seeded in the database.
Without a key the storefront falls back to bundled product fixtures.

---

## Day-to-day commands

All from the repo root.

| Command                                    | What it does                                          |
| ------------------------------------------ | ----------------------------------------------------- |
| `pnpm install`                             | Install / sync workspace dependencies.                |
| `pnpm dev`                                 | Run every app's `dev` in parallel (via Turbo).        |
| `pnpm --filter @risitex/backend dev`       | Run only the backend (`medusa develop`).              |
| `pnpm --filter @risitex/storefront dev`    | Run only the storefront (`next dev`).                 |
| `pnpm --filter @risitex/backend exec medusa db:migrate` | Apply DB migrations.                     |
| `pnpm --filter @risitex/backend typecheck` | Type-check the backend (heavy — see note below).      |
| `pnpm docker:up` / `docker:down`           | Start / stop Postgres + Redis containers.             |
| `pnpm docker:logs` / `docker:ps`           | Tail logs / show container status.                    |
| `pnpm lint` · `pnpm format`                | ESLint / Prettier across the workspace.               |
| `pnpm build`                               | Production build of every app + package (see note).   |
| `pnpm clean`                               | Wipe build outputs, caches, and `node_modules`.       |

---

## Troubleshooting

### Backend OOMs on boot (`JavaScript heap out of memory`)

If `pnpm dev` for the backend crashes with a heap OOM ~1–2 min in, **before**
port 9000 opens, check these two things (both are already configured in this repo —
this section explains why, so a future change doesn't reintroduce the problem):

1. **TypeScript version.** `apps/backend/package.json` must use `typescript@^5.9.0`,
   **not** 6.x. TS 6.x triggers infinite recursive type-instantiation on Medusa's
   generics and never terminates. `apps/backend/tsconfig.json` correspondingly uses
   `"ignoreDeprecations": "5.0"`.
2. **ts-node transpile-only.** `apps/backend/tsconfig.json` contains:
   ```json
   "ts-node": { "transpileOnly": true }
   ```
   Medusa's dev runtime loads modules through ts-node; with full type-checking it
   accumulates the checker state across this project's large auto-generated service
   types and OOMs (~6–7 GB). `transpileOnly` skips the per-file check at load — the
   emitted code is identical. Type-check separately with `pnpm --filter @risitex/backend typecheck`.

### `pnpm build` runs out of memory

Production `medusa build` is memory-heavy on this codebase: the backend type-check
needs ~10 GB and the admin (Vite) bundle peaks > 8 GB. **Run production builds on
CI or a machine with ≥ 16 GB free RAM** (e.g. `NODE_OPTIONS=--max-old-space-size=12288 pnpm build`).
Local `pnpm dev` does not need this — dev uses on-the-fly transpilation and a lazy
admin dev server.

### Port already in use

Backend is `:9000`, storefront `:3000`. `EADDRINUSE` means a previous dev server is
still running — stop it (or change `next dev -p`).

### Database connection refused

Make sure `pnpm docker:up` succeeded and the ports in `apps/backend/.env`
(`5435` / `16380`) match the running containers (`pnpm docker:ps`).

---

## Domain primer (textile-specific concepts a generic Medusa store doesn't have)

- **Matrix ordering** — a SKU is a size × color grid; buyers fill quantities into a matrix instead of clicking each variant.
- **MOQ (Minimum Order Quantity)** — a single per-product value counted in **individual pieces**; enforced server-side via the B2B pricing rules engine and on the PDP bulk-order grid.
- **Variant packs** — a variant can be sold as a multi-piece pack (e.g. a "30-36" pack of 4). Set the integer key **`pack_size`** in the variant's **metadata** in Medusa Admin (absent/`1` = single piece). The wholesale grid counts each selected pack as `pack_size` individual pieces toward MOQ and pricing.
- **Master Carton** — units per carton; some SKUs must round up to whole cartons.
- **Customer tiers** — drive pricing, MOQ, credit limits, and product visibility.
- **Sales rep + affiliate attribution** — reps act on behalf of B2B customers; commissions and referral rewards are tracked.
- **Wallet + credit terms** — internal INR wallet (Cashfree) and net-terms credit for approved B2B companies.

---

## Notes

- **pnpm + Turborepo** — content-addressable store + hardlinks for fast installs;
  Turborepo caches tasks by their inputs so unchanged `build`/`lint` runs are near-instant.
- The backend is the result of consolidating a previously separate Medusa codebase
  into `apps/backend`; see `docs/superpowers/specs/` for the design and rationale.
- See `PRODUCTION-CHECKLIST.md` before deploying.
