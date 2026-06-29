# syntax=docker/dockerfile:1.7
# Medusa v2 backend — reproducible production image.
#
# Build context: REPO ROOT (not apps/medusa-backend). The backend's
# package.json declares file: deps on packages/{types,api-contracts,
# api-clients}; those paths only resolve when the build container can
# see both apps/medusa-backend/ and packages/. Compose passes
# `context: .` + `dockerfile: apps/medusa-backend/Dockerfile`.
#
# Build:  docker build -t polemarch-backend -f apps/medusa-backend/Dockerfile .
# Run:    docker run --rm -p 9000:9000 --env-file .env polemarch-backend
#
# Two-stage: an installer stage produces /workspace with tree-shaken
# node_modules, then a slim runtime image copies only what's needed
# to run `medusa start`.

ARG NODE_VERSION=24.16.0

# ── Stage 1: dependencies + build ──────────────────────────────────
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /workspace

RUN corepack enable

# Bring in the @polemarch/* workspace packages first so the file:
# deps in apps/medusa-backend/package.json resolve at npm install.
COPY packages ./packages

# Build the ERPNext Medusa plugin before the backend's npm install so
# its `.medusa/server/src/admin/index.mjs` export exists when the
# backend's vite/rollup pass resolves `@polemarch/medusa-plugin-erpnext/admin`.
# The plugin's own `prepare` script (`medusa plugin:build || true`)
# silently no-ops in the backend's npm-install context because the
# CLI dependency isn't installed yet — so we drive it explicitly with
# the plugin's own dev deps installed first.
WORKDIR /workspace/packages/medusa-plugin-erpnext
RUN npm install \
    --include=dev \
    --include=optional \
    --legacy-peer-deps \
    --os=linux \
    --cpu=x64 \
    --libc=glibc \
    --no-audit --no-fund --no-progress \
 && npm run build

# Backend manifest + lockfile.
WORKDIR /workspace
COPY apps/medusa-backend/package.json apps/medusa-backend/package-lock.json ./apps/medusa-backend/

WORKDIR /workspace/apps/medusa-backend

# Using `install` not `ci`:
#   · the lockfile has drifted from package.json
#   · it was generated on arm64-darwin (wrong platform for linux-x64
#     native deps like bcrypt). --os/--cpu/--libc force linux-x64-gnu.
# `--no-workspaces` matches what we run locally — Phase 1 of the
# architecture refactor narrowed the root workspaces glob to
# `packages/*` only; apps consume packages via file: deps + symlinks.
RUN npm install \
    --no-workspaces \
    --include=optional \
    --os=linux \
    --cpu=x64 \
    --libc=glibc \
    --no-audit --no-fund --no-progress

# Now the source. `medusa build` emits to .medusa/server which the
# runtime stage consumes.
WORKDIR /workspace
COPY apps/medusa-backend ./apps/medusa-backend

WORKDIR /workspace/apps/medusa-backend

# medusa-config.ts hard-fails on the literal "supersecret" default,
# so CI / Docker needs placeholder values. These never leave the
# builder image — runtime values come from the host's env.
ENV JWT_SECRET=build-placeholder-jwt-secret
ENV COOKIE_SECRET=build-placeholder-cookie-secret
ENV DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder
RUN npm run build

# ── Stage 2: runtime ───────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime

# Runtime layout mirrors the builder so the @polemarch/* file:-deps
# at apps/medusa-backend/node_modules/@polemarch/* (symlinks pointing
# at /workspace/packages/*) resolve at request time when Medusa
# dynamic-requires module code:
#   /workspace/packages/...
#   /workspace/apps/medusa-backend/...
# WORKDIR + cwd-relative paths in Medusa (FileService writes to
# `process.cwd()/static`) anchor at /workspace/apps/medusa-backend
# instead of /app — compose.yml's medusa-uploads volume mounts at
# the matching path (see the comment there).
WORKDIR /workspace/apps/medusa-backend

# Non-root user. dumb-init reaps zombies so `medusa start` shuts
# down cleanly on SIGTERM. Home dir lives at the workspace path so
# anything the runtime writes to ~/.cache (rare) lands somewhere
# the app user owns.
RUN apt-get update && apt-get install -y --no-install-recommends \
        dumb-init \
        wget \
        qpdf \
        ghostscript \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r app \
    && useradd -r -g app -d /workspace/apps/medusa-backend -s /sbin/nologin app \
    && mkdir -p /tmp/.npm /workspace/apps/medusa-backend/static \
    && chown -R app:app /workspace /tmp/.npm

COPY --from=builder --chown=app:app /workspace/packages /workspace/packages
COPY --from=builder --chown=app:app /workspace/apps/medusa-backend/.medusa /workspace/apps/medusa-backend/.medusa
COPY --from=builder --chown=app:app /workspace/apps/medusa-backend/node_modules /workspace/apps/medusa-backend/node_modules
COPY --from=builder --chown=app:app /workspace/apps/medusa-backend/package.json /workspace/apps/medusa-backend/package.json
COPY --from=builder --chown=app:app /workspace/apps/medusa-backend/medusa-config.ts /workspace/apps/medusa-backend/medusa-config.ts
COPY --from=builder --chown=app:app /workspace/apps/medusa-backend/tsconfig.json /workspace/apps/medusa-backend/tsconfig.json
COPY --from=builder --chown=app:app /workspace/apps/medusa-backend/src /workspace/apps/medusa-backend/src
# Admin UI bundle. medusa build emits to dist/public/admin (per
# tsconfig outDir), but Medusa looks for it at <cwd>/public/admin at
# serve time — relocate.
COPY --from=builder --chown=app:app /workspace/apps/medusa-backend/dist /workspace/apps/medusa-backend/dist
COPY --from=builder --chown=app:app /workspace/apps/medusa-backend/dist/public/admin /workspace/apps/medusa-backend/public/admin

USER app
EXPOSE 9000

ENV NODE_ENV=production
# Redirect npm cache to a tmpfs path the `app` user can write to —
# CMD uses `npx medusa db:migrate` which creates cache dirs.
ENV NPM_CONFIG_CACHE=/tmp/.npm
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget --quiet --spider http://localhost:9000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "run", "start"]
