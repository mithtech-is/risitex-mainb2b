# RISITEX nuclear reset: stop containers, drop Docker volumes (DELETES local data),
# clean Turbo cache, clean node_modules.
#
# Usage: from repo root, run:    .\scripts\reset.ps1
#
# WARNING: this destroys local DB data. Use only when you want a fresh slate.

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "==> RISITEX nuclear reset" -ForegroundColor Yellow
$confirm = Read-Host "This will DELETE local Postgres + Redis data. Type 'yes' to continue"
if ($confirm -ne "yes") {
  Write-Host "Aborted." -ForegroundColor Red
  exit 1
}

if (Test-Path "infrastructure/docker/docker-compose.yml") {
  Write-Host "==> Stopping containers + dropping volumes..." -ForegroundColor Cyan
  docker compose -f infrastructure/docker/docker-compose.yml down -v
}

Write-Host "==> Cleaning Turbo caches..." -ForegroundColor Cyan
Get-ChildItem -Path . -Recurse -Force -Directory -Filter ".turbo" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "==> Cleaning node_modules..." -ForegroundColor Cyan
Get-ChildItem -Path . -Recurse -Force -Directory -Filter "node_modules" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`n==> Reset complete. To rebuild:" -ForegroundColor Green
Write-Host "    pnpm install"
Write-Host "    .\scripts\dev.ps1"
