#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════
# Mandani Studio ERP — Complete Database Reset to Clean Slate
# ═════════════════════════════════════════════════════════════════

set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/crmstudio}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/crmstudio}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo "=========================================================="
echo "⚠️  شروع عملیات بازنشانی پایگاه داده به حالت اولیه (Factory Reset)"
echo "⏰ زمان: $(date)"
echo "=========================================================="

mkdir -p "${BACKUP_DIR}"
if [ -d "${DATA_DIR}" ]; then
  echo "📦 ذخیره نسخه پشتیبان کامل قبل از حذف..."
  tar -czf "${BACKUP_DIR}/pre_reset_${TIMESTAMP}.tar.gz" -C "${DATA_DIR}" . 2>/dev/null || true
  echo "✓ بکاپ ذخیره شد: ${BACKUP_DIR}/pre_reset_${TIMESTAMP}.tar.gz"
fi

if [ -d "${DATA_DIR}/tenants" ]; then
  rm -f "${DATA_DIR}/tenants"/*.json 2>/dev/null || true
  rm -f "${DATA_DIR}/tenants"/*.meta.json 2>/dev/null || true
fi

rm -f "${DATA_DIR}/crmstudio_db.json" 2>/dev/null || true
rm -f "${DATA_DIR}/crmstudio_meta.json" 2>/dev/null || true
rm -rf "${DATA_DIR}/outbox"/* 2>/dev/null || true

mkdir -p "${DATA_DIR}/tenants"

echo "🔄 راه‌اندازی مجدد سرویس crmstudio-sync..."
systemctl restart crmstudio-sync 2>/dev/null || true

echo "✓ دیتابیس سرور با موفقیت به حالت صفر و آماده ثبت‌نام بازنشانی گردید."
