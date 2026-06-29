# RISITEX Postgres backup (local dev).
# Dumps the database to infrastructure/postgres/backups/<timestamp>.dump (gitignored).
#
# Usage: from repo root, run:    .\infrastructure\postgres\backup.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envFile = Join-Path $repoRoot "infrastructure\docker\.env"

$envVars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match "^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$") { $envVars[$matches[1]] = $matches[2] }
}
$pgUser = $envVars["POSTGRES_USER"]
$pgDb   = $envVars["POSTGRES_DB"]

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $PSScriptRoot "backups"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
$dumpFile = Join-Path $backupDir "$pgDb-$timestamp.dump"

Write-Host "==> Backing up '$pgDb' to $dumpFile..." -ForegroundColor Cyan
docker exec risitex-postgres pg_dump -U $pgUser -Fc -Z 5 $pgDb > $dumpFile
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAILED" -ForegroundColor Red
  exit $LASTEXITCODE
}
$size = [math]::Round((Get-Item $dumpFile).Length / 1MB, 2)
Write-Host "==> Done. ${size}MB at $dumpFile" -ForegroundColor Green
