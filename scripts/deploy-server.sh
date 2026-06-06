#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/www/elegooEmail}"
BACKUP_ROOT="${BACKUP_ROOT:-/www/elegooEmail-backups}"
PM2_APP_NAME="${PM2_APP_NAME:-elegoo-email}"

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
pm2 restart "$PM2_APP_NAME"
pm2 save

echo "Deploy complete."
