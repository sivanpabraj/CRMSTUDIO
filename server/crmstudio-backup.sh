#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/crmstudio"
DATA_FILE="/var/lib/crmstudio/crmstudio_db.json"
TENANTS_DIR="/var/www/crmstudio/data/tenants"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"

# پشتیبان‌گیری از دیتابیس تک‌فایلی پیش‌فرض
if [ -f "$DATA_FILE" ] && [ -s "$DATA_FILE" ]; then
    ARCHIVE="$BACKUP_DIR/crmstudio_backup_${TIMESTAMP}.json.gz"
    gzip -c "$DATA_FILE" > "$ARCHIVE"
    chmod 600 "$ARCHIVE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Automated backup created: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
fi

# پشتیبان‌گیری از همه دیتابیس‌های چندمستاجره (Tenants)
if [ -d "$TENANTS_DIR" ]; then
    TENANTS_ARCHIVE="$BACKUP_DIR/crmstudio_tenants_${TIMESTAMP}.tar.gz"
    tar -czf "$TENANTS_ARCHIVE" -C "$TENANTS_DIR" . 2>/dev/null || true
    if [ -f "$TENANTS_ARCHIVE" ]; then
        chmod 600 "$TENANTS_ARCHIVE"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Automated tenants backup created: $TENANTS_ARCHIVE ($(du -h "$TENANTS_ARCHIVE" | cut -f1))"
        ARCHIVE="${TENANTS_ARCHIVE}"
    fi
fi

# پشتیبان‌گیری از PostgreSQL اگر متغیر DATABASE_URL فعال باشد
if [ -n "${DATABASE_URL:-}" ]; then
    PG_ARCHIVE="$BACKUP_DIR/crmstudio_pg_${TIMESTAMP}.sql.gz"
    pg_dump "$DATABASE_URL" | gzip > "$PG_ARCHIVE" || true
    if [ -f "$PG_ARCHIVE" ] && [ -s "$PG_ARCHIVE" ]; then
        chmod 600 "$PG_ARCHIVE"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Automated PostgreSQL backup created: $PG_ARCHIVE"
        ARCHIVE="${PG_ARCHIVE}"
    fi
fi

# ارسال فایل بکاپ به ربات بله (Bale Bot) در صورت تنظیم
if [ -n "${BALE_BOT_TOKEN:-}" ] && [ -n "${BALE_CHAT_ID:-}" ] && [ -n "${ARCHIVE:-}" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dispatching backup to Bale Bot..."
    curl -s -F chat_id="${BALE_CHAT_ID}" \
         -F document=@"${ARCHIVE}" \
         -F caption="📦 پشتیبان خودکار استودیو — تاریخ: $(date '+%Y-%m-%d %H:%M:%S')" \
         "https://tapi.bale.ai/bot${BALE_BOT_TOKEN}/sendDocument" > /dev/null || true
fi

# ارسال فایل بکاپ به تلگرام (Telegram Bot) در صورت تنظیم
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] && [ -n "${ARCHIVE:-}" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dispatching backup to Telegram Bot..."
    curl -s -F chat_id="${TELEGRAM_CHAT_ID}" \
         -F document=@"${ARCHIVE}" \
         -F caption="📦 پشتیبان خودکار استودیو — تاریخ: $(date '+%Y-%m-%d %H:%M:%S')" \
         "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" > /dev/null || true
fi

# حذف خودکار بکاپ‌های قدیمی‌تر از ۳۰ روز
find "$BACKUP_DIR" -name "crmstudio_*" -type f -mtime +30 -delete 2>/dev/null || true

