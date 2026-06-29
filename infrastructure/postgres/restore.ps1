# RISITEX Postgres restore (local dev).
# Restores a .dump file produced by backup.ps1.
#
# Usage: .\infrastructure\postgres\restore.ps1 -DumpFile path\to\file.dump
#
# WARNING: this drops + recreates objects in the target database. Local dev only.

param(
  [Parameter(Mandatory)][string]$DumpFile,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envFile = Join-Path $repoRoot "infrastructure\docker\.env"

$envVars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match "^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$") { $envVars[$matches[1]] = $matches[2] }
}
$pgUser = $envVars["POSTGRES_USER"]
$pgDb   = $envVars["POSTGRES_DB"]

if (-not (Test-Path $DumpFile)) {
  Write-Host "ERROR: $DumpFile does not exist" -ForegroundColor Red
  exit 1
}

if (-not $Force) {
  Write-Warning "About to restore $DumpFile -> $pgDb. THIS WILL OVERWRITE EXISTING DATA."
  $confirm = Read-Host "Type 'yes' to continue"
  if ($confirm -ne "yes") { Write-Host "Aborted." -ForegroundColor Red; exit 1 }
}

Write-Host "==> Copying dump into container..." -ForegroundColor Cyan
docker cp $DumpFile risitex-postgres:/tmp/_restore.dump | Out-Null

Write-Host "==> Restoring..." -ForegroundColor Cyan
docker exec risitex-postgres pg_restore -U $pgUser -d $pgDb -c --if-exists /tmp/_restore.dump
Write-Host "==> Done." -ForegroundColor Green
