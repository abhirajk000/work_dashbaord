#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${1:-productivity-dashboard}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${NEON_API_KEY:-}" ]]; then
  echo "Missing NEON_API_KEY."
  echo "Get one at: https://console.neon.tech/app/settings/api-keys"
  echo "Then run: export NEON_API_KEY=your_key"
  exit 1
fi

echo "→ Creating Neon project: ${PROJECT_NAME}"
PROJECT_JSON="$(npx --yes neonctl@latest projects create --name "${PROJECT_NAME}" --output json)"
PROJECT_ID="$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.project?.id || j.id)" "${PROJECT_JSON}")"

echo "→ Project ID: ${PROJECT_ID}"
echo "→ Fetching connection string"
DATABASE_URL="$(npx --yes neonctl@latest connection-string --project-id "${PROJECT_ID}")"

export DATABASE_URL
echo "→ Applying schema"
node scripts/migrate-schema.mjs

API_KEY="$(openssl rand -hex 32)"

cat > .env.local <<EOF
DATABASE_URL=${DATABASE_URL}
DASHBOARD_API_KEY=${API_KEY}
VITE_DASHBOARD_API_KEY=${API_KEY}
EOF

echo ""
echo "✓ Neon project ready. Saved secrets to .env.local"
echo ""
echo "Add these to Vercel → Settings → Environment Variables:"
echo "  DATABASE_URL=${DATABASE_URL}"
echo "  DASHBOARD_API_KEY=${API_KEY}"
echo "  VITE_DASHBOARD_API_KEY=${API_KEY}"
