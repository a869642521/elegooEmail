#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/www/elegooEmail}"
BACKUP_ROOT="${BACKUP_ROOT:-/www/elegooEmail-backups}"
PM2_APP_NAME="${PM2_APP_NAME:-elegoo-email}"

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.npm-global/bin:/root/.nvm/versions/node/$(node -v 2>/dev/null || true)/bin:$PATH"

PM2_BIN="${PM2_BIN:-$(command -v pm2 || true)}"
if [ -z "$PM2_BIN" ]; then
  echo "pm2 command not found. Install it with: npm install -g pm2" >&2
  exit 127
fi

cd "$APP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$BACKUP_ROOT/$timestamp"
mkdir -p "$backup_dir"

if [ -f data/cases.json ]; then
  mkdir -p "$backup_dir/data"
  cp data/cases.json "$backup_dir/data/cases.json"
fi

if [ -d public/captures ]; then
  mkdir -p "$backup_dir/public"
  cp -a public/captures "$backup_dir/public/captures"
fi

echo "Backup saved to $backup_dir"

git pull --ff-only origin main
npm ci
npm run build
"$PM2_BIN" restart "$PM2_APP_NAME"
"$PM2_BIN" save

echo "Deploy complete."
