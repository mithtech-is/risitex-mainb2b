# RISITEX Postgres migration runner.
# Applies pending SQL files from migrations/ in alphabetical order.
#
# Usage: from repo root, run:    .\infrastructure\postgres\migrate.ps1
#
# Idempotent: skips migrations whose `version` is already in public.schema_migrations.
# Atomic: each migration runs in its own transaction (BEGIN/COMMIT inside the SQL file)
# with psql `-v ON_ERROR_STOP=1` so any error aborts.

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$migrationsDir = Join-Path $PSScriptRoot "migrations"
$envFile = Join-Path $repoRoot "infrastructure\docker\.env"

if (-not (Test-Path $envFile)) {
  Write-Host "ERROR: $envFile not found. Copy .env.example to .env first." -ForegroundColor Red
  exit 1
}

# Parse infra .env
$envVars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match "^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$") {
    $envVars[$matches[1]] = $matches[2]
  }
}
$pgUser = $envVars["POSTGRES_USER"]
$pgDb   = $envVars["POSTGRES_DB"]
if (-not $pgUser -or -not $pgDb) {
  Write-Host "ERROR: POSTGRES_USER or POSTGRES_DB missing from $envFile." -ForegroundColor Red
  exit 1
}

# Sanity: is the container up?
$state = docker inspect --format "{{.State.Status}}" risitex-postgres 2>$null
if ($state -ne "running") {
  Write-Host "ERROR: risitex-postgres container is not running (state: '$state')." -ForegroundColor Red
  Write-Host "Run 'pnpm docker:up' first." -ForegroundColor Yellow
  exit 1
}

Write-Host "==> Migration runner" -ForegroundColor Cyan
Write-Host "    container : risitex-postgres"
Write-Host "    user      : $pgUser"
Write-Host "    database  : $pgDb"
Write-Host "    migrations: $migrationsDir`n"

# Read applied migrations. If schema_migrations table doesn't exist yet (first run), treat as empty.
$applied = @()
$appliedRaw = docker exec risitex-postgres psql -U $pgUser -d $pgDb -tA -c "SELECT version FROM public.schema_migrations" 2>$null
if ($LASTEXITCODE -eq 0 -and $appliedRaw) {
  $applied = $appliedRaw -split "`r?`n" | Where-Object { $_ -ne "" }
}

$files = Get-ChildItem $migrationsDir -Filter "*.sql" | Sort-Object Name
if (-not $files) {
  Write-Host "No migration files found." -ForegroundColor Yellow
  exit 0
}

$appliedCount = 0
foreach ($f in $files) {
  $version = $f.BaseName
  if ($applied -contains $version) {
    Write-Host "  = $version (already applied)" -ForegroundColor DarkGray
    continue
  }
  Write-Host "  + $version applying..." -ForegroundColor Cyan
  $checksum = (Get-FileHash $f.FullName -Algorithm SHA256).Hash

  # Copy file into container, run with ON_ERROR_STOP
  docker cp $f.FullName risitex-postgres:/tmp/_migration.sql | Out-Null
  docker exec risitex-postgres psql -U $pgUser -d $pgDb -v ON_ERROR_STOP=1 -f /tmp/_migration.sql
  if ($LASTEXITCODE -ne 0) {
    Write-Host "    FAILED" -ForegroundColor Red
    exit $LASTEXITCODE
  }

  # Record
  docker exec risitex-postgres psql -U $pgUser -d $pgDb -c "INSERT INTO public.schema_migrations (version, checksum) VALUES ('$version', '$checksum')" | Out-Null
  Write-Host "    ok (sha256: $($checksum.Substring(0,12))...)" -ForegroundColor Green
  $appliedCount++
}

Write-Host ""
if ($appliedCount -eq 0) {
  Write-Host "Nothing to apply. Database is at the latest migration." -ForegroundColor Green
} else {
  Write-Host "Applied $appliedCount migration(s)." -ForegroundColor Green
}
