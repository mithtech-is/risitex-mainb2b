# docs/architecture

Architecture Decision Records (ADRs) and high-level system docs.

Convention: every significant decision gets a numbered file `NNNN-decision-title.md`:

- `0001-monorepo-tooling.md` — why pnpm + Turborepo 2.x (Phase 2).
- `0002-docker-compose-local-dev.md` — why Docker Compose vs. local installs (Phase 3).
- ...

Each ADR follows the standard structure: **Status / Context / Decision / Consequences**.

ADRs are append-only. If a decision is reversed, write a new ADR superseding the old one — don't edit history.
