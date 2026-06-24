#!/bin/bash
# Deploy: push to main, then run DB migrations on production.
set -e

DOMAIN="13media-live-affiliate.vercel.app"
MIGRATE_SECRET="13media-migrate-2026"

echo "→ Pushing to origin/main…"
git push origin main

echo "→ Waiting for Vercel to pick up the build (15s)…"
sleep 15

echo "→ Running migrations on $DOMAIN…"
RESULT=$(curl -s -X POST "https://${DOMAIN}/api/admin/apply-migrations?secret=${MIGRATE_SECRET}")
echo "$RESULT"

# Check if migrations succeeded
if echo "$RESULT" | grep -q '"ok":true'; then
  APPLIED=$(echo "$RESULT" | grep -o '"applied":\[[^]]*\]')
  echo "✓ Migrations OK — $APPLIED"
else
  echo "✗ Migration may have failed — check the response above"
  exit 1
fi
