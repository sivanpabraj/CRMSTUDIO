#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════
# Mandani Studio ERP — One-Click Automated Server Update Engine
# پشتیبانی از شاخه اختیاری: bash server-update.sh eng/glass-pwa-ux-v2
# ═════════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/crmstudio}"
DATA_DIR="${DATA_DIR:-/var/lib/crmstudio/tenants}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/crmstudio}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TARGET_BRANCH="${1:-}"

echo "=========================================================="
echo "🚀 شروع فرآیند به‌روزرسانی خودکار Mandani Studio ERP"
echo "⏰ زمان: $(date)"
echo "=========================================================="

mkdir -p "${BACKUP_DIR}"
if [ -d "${DATA_DIR}" ]; then
  echo "📦 بکاپ دیتابیس استودیوها..."
  tar -czf "${BACKUP_DIR}/pre_update_${TIMESTAMP}.tar.gz" -C "${DATA_DIR}" . || true
  echo "✓ بکاپ: ${BACKUP_DIR}/pre_update_${TIMESTAMP}.tar.gz"
fi

cd "${APP_DIR}"

if [ -n "${TARGET_BRANCH}" ]; then
  echo "📌 سوییچ به شاخه: ${TARGET_BRANCH}"
  git fetch origin "${TARGET_BRANCH}"
  git checkout -B "${TARGET_BRANCH}" "origin/${TARGET_BRANCH}"
  git reset --hard "origin/${TARGET_BRANCH}"
else
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  echo "📥 pull شاخه فعلی: ${CURRENT_BRANCH}"
  git fetch origin "${CURRENT_BRANCH}"
  git reset --hard "origin/${CURRENT_BRANCH}"
fi

echo "✓ کد به‌روز شد — $(git rev-parse --short HEAD)"

# PWA: پاک‌سازی unregister از index.html
if [ -f scripts/patch-index-pwa.sh ]; then
  echo "🔧 patch index.html برای PWA..."
  bash scripts/patch-index-pwa.sh "${APP_DIR}" || true
fi

# Build فرانت در صورت وجود package.json
if [ -f package.json ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "📦 npm ci + build..."
    npm ci --omit=dev 2>/dev/null || npm ci || true
    npm run build 2>/dev/null || true
  fi
fi

# اعتبارسنجی سرور همگام‌سازی
if [ -f server/sync-server.mjs ]; then
  echo "🔍 node -c server/sync-server.mjs"
  node -c server/sync-server.mjs || true
fi

echo "🔄 ری‌استارت سرویس‌ها..."
systemctl restart crmstudio-sync 2>/dev/null || true
systemctl reload nginx 2>/dev/null || true

echo "=========================================================="
echo "✅ به‌روزرسانی تمام شد"
echo "📌 commit: $(git rev-parse --short HEAD)"
echo "📌 branch: $(git rev-parse --abbrev-ref HEAD)"
echo "=========================================================="
