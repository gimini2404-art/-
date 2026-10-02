#!/bin/sh
# Daily PostgreSQL + media backup with retention. Runs forever inside the "backup" container.
set -eu
KEEP="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR_UTC:-03}"
mkdir -p /backups
while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%F) ${HOUR}:00:00" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  stamp=$(date -u +%F)
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "/backups/db-$stamp.sql.gz" && echo "db backup $stamp ok"
  [ -d /private ] && tar czf "/backups/private-$stamp.tar.gz" -C /private . && echo "private files backup $stamp ok"
  [ -d /media ] && tar czf "/backups/media-$stamp.tar.gz" -C /media . && echo "media backup $stamp ok"
  find /backups -type f \( -name 'db-*.sql.gz' -o -name 'media-*.tar.gz' -o -name 'private-*.tar.gz' \) -mtime +"$KEEP" -delete
done
