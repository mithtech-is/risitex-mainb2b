# 0002 — Local dev uses Docker Compose

**Status:** Accepted (2026-06-10)
**Phase:** 3

## Context

Backend needs Postgres + Redis. Three viable ways to provide them:

- **(A)** Install Postgres + Redis directly on Windows.
- **(B)** Install via WSL2 Ubuntu apt packages.
- **(C)** Run them as Docker containers from a `docker-compose.yml`.

We're not yet building for production. We need a dev story that:

1. Is identical across developers (everyone gets the same Postgres major + extensions + config).
2. Is trivial to destroy + recreate when schemas change.
3. Mirrors what we'll likely run in production (probably containerized too).
4. Doesn't pollute the host OS.

## Decision

**Option C: Docker Compose.** Specifically:

- `postgres:16-alpine` — Postgres 16 LTS is supported by Medusa 2.0 and current until 2028.
- `redis:7-alpine` — Redis 7.x is the current major.
- Named volumes (`risitex-postgres-data`, `risitex-redis-data`) for data persistence across container restarts.
- An internal bridge network (`risitex-net`) for container-to-container service discovery.
- A first-boot init script that enables the Postgres extensions Medusa needs (`uuid-ossp`, `pg_trgm`, `citext`, `pgcrypto`).
- Healthchecks on both services so other containers (added in Phase 5+) can `depends_on: { condition: service_healthy }`.

## Consequences

**Good**

- `pnpm docker:up` from a fresh clone gets a working DB + cache in <30s.
- Schema reset is `.\scripts\reset.ps1` — no Windows uninstall pain.
- Same image hash runs in prod (when we get there), so dev/prod drift is bounded.
- pgAdmin and RedisInsight (Phase 1) connect to localhost:5432 and localhost:6379 unchanged.

**Bad / tradeoffs**

- 1-2 GB of Docker Desktop memory always running. Acceptable on dev machines.
- Postgres major upgrades require coordinating the image tag + a data dump/restore (covered in Phase 10).
- `localhost:5432` collides with any locally-installed Postgres. The README documents how to either disable the local service or remap the port.

**Reversibility**

- The compose file declares everything. Moving to k8s later (Phase 10) reuses the same images + env vars + init script.
