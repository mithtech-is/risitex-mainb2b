# RISITEX local dev launcher
# Usage: from repo root, run:    .\scripts\dev.ps1
#
# What it does:
#   1. Start Postgres + Redis containers (background)
#   2. Show container status
#   3. Tell you how to start the apps

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "==> Starting RISITEX local dev infrastructure..." -ForegroundColor Cyan

if (-not (Test-Path "infrastructure/docker/docker-compose.yml")) {
  Write-Host "ERROR: infrastructure/docker/docker-compose.yml not found." -ForegroundColor Red
  Write-Host "This file is created in Phase 3. Complete Phase 3 first." -ForegroundColor Yellow
  exit 1
}

docker compose -f infrastructure/docker/docker-compose.yml up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n==> Containers up. Status:" -ForegroundColor Green
docker compose -f infrastructure/docker/docker-compose.yml ps

Write-Host "`n==> Next steps:" -ForegroundColor Cyan
Write-Host "    pnpm dev           # start every app's dev server"
Write-Host "    pnpm docker:logs   # tail Postgres + Redis logs"
Write-Host "    pnpm docker:down   # stop containers (data persists in volumes)"
