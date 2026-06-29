# infrastructure/docker

Local development infrastructure: **PostgreSQL 16** + **Redis 7**, both running as Docker containers.

For local dev only. Production deployment (Hetzner) is configured separately in a later phase.

---

## What's in here

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Service definitions for `postgres` and `redis`. |
| `.env.example` | Template for your local `.env` (committed). |
| `.env` | Your local secrets (gitignored — never commit). |
| `postgres-init/01-extensions.sql` | Runs once on first Postgres boot. Enables `uuid-ossp`, `pg_trgm`, `citext`, `pgcrypto`. |

Data lives in **named Docker volumes** (`risitex-postgres-data`, `risitex-redis-data`), NOT in this folder. Those volumes survive `docker compose down` and are wiped only by `docker compose down -v` or `.\scripts\reset.ps1`.

---

## First-time setup

From the **repo root**:

```powershell
# 1. Copy the env template (only needed once)
Copy-Item infrastructure/docker/.env.example infrastructure/docker/.env

# 2. Start containers in the background
pnpm docker:up

# 3. Confirm both are healthy
pnpm docker:ps
```

Expected `pnpm docker:ps` output (both `(healthy)`):

```
NAME                IMAGE              ...   STATUS                   PORTS
risitex-postgres    postgres:16-alpine ...   Up X seconds (healthy)   0.0.0.0:5432->5432/tcp
risitex-redis       redis:7-alpine     ...   Up X seconds (healthy)   0.0.0.0:6379->6379/tcp
```

---

## Day-to-day

| Command | What it does |
| --- | --- |
| `pnpm docker:up` | Start both containers in background. |
| `pnpm docker:down` | Stop containers. Data **persists** in volumes. |
| `pnpm docker:logs` | Tail both containers' logs. Ctrl-C to stop tailing. |
| `pnpm docker:ps` | Show container status. |
| `.\scripts\reset.ps1` | DESTROY local DB data and start fresh. |

---

## Connecting from your apps

**Inside containers** (e.g. backend container later in Phase 5):

- Postgres URL: `postgresql://risitex:<password>@postgres:5432/risitex`
- Redis URL: `redis://redis:6379`

(The hostnames `postgres` and `redis` are auto-resolved on the internal `risitex-net` Docker network.)

**From your Windows host** (for pgAdmin, RedisInsight, ad-hoc scripts):

- Postgres: `localhost:5432` (or whatever you set `POSTGRES_PORT` to)
- Redis: `localhost:6379`

### Connecting with pgAdmin

1. Open pgAdmin 4 from Start menu.
2. Right-click "Servers" → Register → Server.
3. **General → Name:** `RISITEX (local)`.
4. **Connection → Host:** `localhost`, **Port:** `5432`, **DB:** `risitex`, **User:** `risitex`, **Password:** from your `.env`.
5. Save. The DB tree shows the installed extensions under `Databases > risitex > Extensions`.

### Connecting with RedisInsight

1. Open RedisInsight from Start menu.
2. "Add Redis Database" → "Connect to Redis Database".
3. **Host:** `localhost`, **Port:** `6379`, **Name:** `RISITEX (local)`. No password.
4. Save.

---

## Troubleshooting

**Port 5432 already in use** — you have a local Postgres install (PostgreSQL 18 bundled with pgAdmin). Either stop that service:

```powershell
Stop-Service postgresql-x64-18
Set-Service postgresql-x64-18 -StartupType Manual
```

…or change `POSTGRES_PORT=5433` in `.env` and `pnpm docker:up` again.

**Container won't start / "no such image"** — image pull failed. Check Docker Desktop is running, then:

```powershell
docker compose -f infrastructure/docker/docker-compose.yml pull
pnpm docker:up
```

**Healthcheck never goes green** — read the logs:

```powershell
pnpm docker:logs
```

Common cause: stale data volume from a previous run with different `POSTGRES_PASSWORD`. Postgres only honours `POSTGRES_PASSWORD` on FIRST boot. Fix: `docker compose down -v` (destroys data) and `pnpm docker:up`.

**Forgot what's in the data volumes?**

```powershell
docker volume ls
docker volume inspect risitex-postgres-data
```

**"manifest unknown" pulling images** — Docker Hub is rate-limiting your IP. Either log in (`docker login`) or wait an hour.
