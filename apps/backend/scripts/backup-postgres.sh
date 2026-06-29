#!/usr/bin/env bash
#
# backup-postgres.sh — single-shot pg_dump for the Polemarch Medusa DB.
#
# Usage:
#   DATABASE_URL=postgresql://… ./backup-postgres.sh /var/backups/polemarch
#
# Designed to be invoked from cron / a Render scheduled job / a CI runner.
# Reads `DATABASE_URL` from the environment so the script never holds
# credentials. See documents/SECRETS_AND_BACKUPS.md for cron examples and
# the restore drill procedure.
#
# Exit codes:
#   0  success
#   1  bad invocation (missing args / env)
#   2  pg_dump failure
#   3  prune failure (rare; backups still wrote)

set -euo pipefail

BACKUP_DIR="${1:-}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [[ -z "$BACKUP_DIR" ]]; then
    echo "ERROR: backup directory required as first argument" >&2
    echo "Usage: DATABASE_URL=... $0 /path/to/backups" >&2
    exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: DATABASE_URL env var must be set" >&2
    exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
    echo "ERROR: pg_dump not found in PATH" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%d-%H%M%S")
OUTFILE="$BACKUP_DIR/polemarch-medusa-$TIMESTAMP.sql.gz"

echo "[$(date -u +%FT%TZ)] dumping → $OUTFILE"

# --no-owner / --no-privileges keep the dump portable across role names
# (the role on Render won't exist on a developer laptop). gzip on the
# pipe so we never write a plaintext SQL file to disk.
if ! pg_dump \
    --dbname="$DATABASE_URL" \
    --no-owner \
    --no-privileges \
    --format=plain \
    | gzip -9 > "$OUTFILE"
then
    echo "ERROR: pg_dump failed" >&2
    rm -f "$OUTFILE"
    exit 2
fi

# Sanity: refuse to keep an empty / suspiciously-small dump.
SIZE=$(stat -f%z "$OUTFILE" 2>/dev/null || stat -c%s "$OUTFILE")
if [[ "$SIZE" -lt 1024 ]]; then
    echo "ERROR: dump is suspiciously small ($SIZE bytes); deleting" >&2
    rm -f "$OUTFILE"
    exit 2
fi

echo "[$(date -u +%FT%TZ)] wrote $SIZE bytes"

# Prune old backups. -mtime +N matches files older than N days.
echo "[$(date -u +%FT%TZ)] pruning backups older than $RETENTION_DAYS days"
if ! find "$BACKUP_DIR" -maxdepth 1 -type f \
    -name 'polemarch-medusa-*.sql.gz' \
    -mtime +"$RETENTION_DAYS" \
    -print -delete
then
    echo "WARN: prune step failed (backups still wrote)" >&2
    exit 3
fi

echo "[$(date -u +%FT%TZ)] done"
exit 0
