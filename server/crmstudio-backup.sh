#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/crmstudio"
DATA_FILE="/var/lib/crmstudio/crmstudio_db.json"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"

if [ -f "$DATA_FILE" ] && [ -s "$DATA_FILE" ]; then
    ARCHIVE="$BACKUP_DIR/crmstudio_backup_${TIMESTAMP}.json.gz"
    gzip -c "$DATA_FILE" > "$ARCHIVE"
    chmod 600 "$ARCHIVE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Automated backup created: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
    
    # حذف خودکار بکاپ‌های قدیمی‌تر از ۳۰ روز
    find "$BACKUP_DIR" -name "crmstudio_backup_*.json.gz" -type f -mtime +30 -delete
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No database file found yet at $DATA_FILE — skipping backup."
fi
