#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REPO_NAME="${1:-productivity-dashboard}"

if ! gh auth status >/dev/null 2>&1; then
  echo "Log in to GitHub first:"
  gh auth login --hostname github.com --git-protocol https --web
fi

if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin main
else
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
fi

echo "→ Connecting Vercel to GitHub…"
vercel git connect "https://github.com/$(gh api user -q .login)/${REPO_NAME}"
