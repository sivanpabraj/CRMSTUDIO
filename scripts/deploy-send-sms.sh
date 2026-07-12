#!/usr/bin/env bash
# Deploy send-sms Edge Function + SMS secrets (reads .env, never prints secrets)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"

if ! command -v supabase >/dev/null 2>&1; then
  echo "ERROR: supabase CLI not found in PATH" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "ERROR: .env missing" >&2
  exit 1
fi

# Load .env without exporting to process list unnecessarily
set -a
# shellcheck disable=SC1091
source .env
set +a

: "${SMS_API_KEY:?SMS_API_KEY missing in .env}"
SMS_PROVIDER="${SMS_PROVIDER:-melipayamak}"
SMS_LINE_NUMBER="${SMS_LINE_NUMBER:-}"
SMS_USERNAME="${SMS_USERNAME:-}"
PROJECT_REF="gfzfmecglamyxevvttji"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN is required." >&2
  echo "Create one at: https://supabase.com/dashboard/account/tokens" >&2
  echo "Then: export SUPABASE_ACCESS_TOKEN='sbp_...'" >&2
  exit 2
fi

echo "==> Setting secrets (values hidden)"
SECRET_ARGS=(
  "SMS_PROVIDER=$SMS_PROVIDER"
  "SMS_API_KEY=$SMS_API_KEY"
  "SMS_LINE_NUMBER=$SMS_LINE_NUMBER"
  "ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:8080,http://localhost:8080"
)
if [[ -n "$SMS_USERNAME" ]]; then
  SECRET_ARGS+=("SMS_USERNAME=$SMS_USERNAME")
fi
supabase secrets set \
  --project-ref "$PROJECT_REF" \
  "${SECRET_ARGS[@]}"

echo "==> Deploying send-sms"
supabase functions deploy send-sms --project-ref "$PROJECT_REF" --no-verify-jwt=false

echo "==> Verify (expect not NOT_FOUND)"
CODE=$(curl -sS -o /tmp/send-sms-check.json -w "%{http_code}" \
  -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/send-sms" \
  -H "Content-Type: application/json" \
  -d '{"phones":["09121111111"],"text":"ping"}' || true)
BODY=$(head -c 200 /tmp/send-sms-check.json || true)
echo "HTTP $CODE"
echo "$BODY"
if echo "$BODY" | grep -q 'NOT_FOUND'; then
  echo "FAIL: function still not found" >&2
  exit 3
fi
echo "OK: function is reachable (401/403 without user JWT is expected)"
