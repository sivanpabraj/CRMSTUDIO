#!/usr/bin/env bash
# اعمال schema چندمستأجری روی Postgres
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATABASE_URL="${DATABASE_URL:-postgresql://crmstudio:crmstudio@127.0.0.1:5432/crmstudio}"

echo "→ migrate: $DATABASE_URL"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/server/schema/001_multi_tenant.sql"
echo "✓ schema applied"
