#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════
# Mandani Studio ERP — One-Click Automated Server Update Engine
# موتور به‌روزرسانی خودکار و ایمن سیستم با ایجاد بکاپ لحظه‌ای
# ═════════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="/var/www/crmstudio"
DATA_DIR="/var/lib/crmstudio/tenants"
BACKUP_DIR="/var/backups/crmstudio"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo "=========================================================="
echo "🚀 شروع فرآیند به‌روزرسانی خودکار Mandani Studio ERP"
echo "⏰ زمان: $(date)"
echo "=========================================================="

# ۱. ایجاد پوشه بکاپ و ذخیره پشتیبان از اطلاعات تننت‌ها و دیتابیس
mkdir -p "${BACKUP_DIR}"
if [ -d "${DATA_DIR}" ]; then
  echo "📦 در حال ایجاد نسخه پشتیبان از دیتابیس استودیوها..."
  tar -czf "${BACKUP_DIR}/pre_update_${TIMESTAMP}.tar.gz" -C "${DATA_DIR}" .
  echo "✓ بکاپ با موفقیت در ${BACKUP_DIR}/pre_update_${TIMESTAMP}.tar.gz ذخیره شد."
fi

# ۲. دریافت آخرین نسخه از ریپازیتوری گیت‌هاب
cd "${APP_DIR}"
echo "📥 در حال دریافت تغییرات جدید از گیت‌هاب..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch origin "${CURRENT_BRANCH}"
git reset --hard "origin/${CURRENT_BRANCH}"
echo "✓ آخرین کدهای نسخه جدید با موفقیت دریافت شدند."

# ۳. بررسی صحت سینتکس فایل‌های سرور
echo "🔍 بررسی اعتبارسنجی سینتکس جاوااسکریپت..."
node -c server/sync-server.mjs
echo "✓ فایل‌های سرور معتبر و بدون خطای نحوی هستند."

# ۴. ری‌استارت سرویس سرور همگام‌سازی و وب‌سرور
echo "🔄 ری‌استارت سرویس‌های سیستمی..."
systemctl restart crmstudio-sync
systemctl reload nginx || true

echo "=========================================================="
echo "✅ سیستم با موفقیت به آخرین نسخه ارتقا یافت!"
echo "📌 هش آخرین کامیت فعال: $(git rev-parse --short HEAD)"
echo "=========================================================="
