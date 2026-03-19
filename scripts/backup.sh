#!/bin/bash
# HRiq Platform Database Backup Script
# Run: bash scripts/backup.sh

BACKUP_DIR="$HOME/Desktop/Remote Leverage/hriq-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="hriq_backup_${TIMESTAMP}.sql"
PG_DUMP="/opt/homebrew/opt/postgresql@17/bin/pg_dump"

DB_URL="postgresql://hriq_app.blomhvnsgumdatojipws:hriqdb2026x@aws-0-us-west-2.pooler.supabase.com:5432/postgres"

mkdir -p "$BACKUP_DIR"

echo "Starting backup (public schema only)..."
"$PG_DUMP" "$DB_URL" \
  --schema=public \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  -f "$BACKUP_DIR/$FILENAME"

if [ $? -eq 0 ]; then
  SIZE=$(du -h "$BACKUP_DIR/$FILENAME" | cut -f1)
  echo "Backup saved: $BACKUP_DIR/$FILENAME ($SIZE)"
  
  # Keep only last 30 backups
  cd "$BACKUP_DIR" && ls -t hriq_backup_*.sql | tail -n +31 | xargs -r rm
  REMAINING=$(ls hriq_backup_*.sql 2>/dev/null | wc -l)
  echo "Done. $REMAINING backups retained."
else
  echo "ERROR: Backup failed!"
  exit 1
fi
