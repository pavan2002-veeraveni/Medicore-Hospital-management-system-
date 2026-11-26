#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
CONTAINER_NAME="${POSTGRES_CONTAINER:-medicore-postgres}"
DB_USER="${POSTGRES_USER:-medicore_user}"
DB_NAME="${POSTGRES_DB:-medicore_db}"

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/medicore_backup_${TIMESTAMP}.sql.gz"

echo "Creating compressed PostgreSQL backup at $BACKUP_FILE..."
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists | gzip > "$BACKUP_FILE"
echo "Backup complete: $BACKUP_FILE"
