# 0001 — Monorepo tooling: pnpm + Turborepo 2.x

**Status:** Accepted (2026-06-10)
**Phase:** 2

## Context

RISITEX is several JS/TS projects that share types, components, and SDKs:

- `apps/backend` (MedusaJS 2.0)
- `apps/storefront` (Next.js 15)
- Possibly `apps/admin` later
- Shared packages for types, UI components, SDK

Three things matter for picking a monorepo tool:

1. **Disk + install speed.** RISITEX will have many `node_modules`. npm balloons disk; pnpm doesn't.
2. **Task graph caching.** Re-running `typecheck` after touching one file should not re-typecheck untouched packages.
3. **Beginner-friendly mental model.** The maintainer is new to monorepos. Lower conceptual surface area wins.

## Decision

- **pnpm** (workspace `workspace:*` protocol) for package management.
- **Turborepo 2.x** for the task graph + cache.

Rejected:

- **npm workspaces alone** — no task graph, slow installs.
- **Yarn 4 (PnP)** — Plug'n'Play breaks Medusa's runtime require resolution.
- **Nx** — more powerful than we need; the project-graph + executor + plugin model is too much surface area for our scale.
- **Lerna** — effectively unmaintained.
- **Rush** — Microsoft-scale tooling; overkill.

## Consequences

**Good**

- ~70% less disk than npm's nested `node_modules`.
- Workspace internal deps cleanly expressed (`"@risitex/shared": "workspace:*"`).
- Turbo's content-addressed cache makes CI fast later (Phase 10).
- Both tools are pure JS, no daemons. No background processes to debug.

**Bad / tradeoffs**

- Some Medusa plugins assume hoisted `node_modules`. pnpm's strict isolation might surface bugs that npm hid. We'll address per-plugin as encountered, likely with `public-hoist-pattern` in `.npmrc`.
- Turbo 2.x changed the task config syntax (`pipeline` → `tasks`). Online tutorials may show old syntax; check the schema URL in `turbo.json` for the current shape.

**Reversibility**

- Switching to Nx later is mechanical (mostly file moves).
- Switching to npm workspaces means accepting slower installs but is trivial otherwise.
