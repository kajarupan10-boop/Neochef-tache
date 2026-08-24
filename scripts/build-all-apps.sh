#!/usr/bin/env bash
# Build all 3 Expo apps to web, assemble into /app/frontend/build/
# Usage: cd /app/frontend && yarn build
#    or: bash /app/scripts/build-all-apps.sh

set -euo pipefail

APPS_DIR="/app/apps"
BUILD_DIR="/app/frontend/build"
LANDING_SRC="/app/scripts/landing-index.html"
SERVE_JSON_SRC="/app/scripts/landing-serve.json"

echo "==> Building neochef-taches, neochef-menu, neochef-events in parallel..."

cd "${APPS_DIR}/neochef-taches" && yarn build:web > /tmp/build-taches.log 2>&1 &
P1=$!
cd "${APPS_DIR}/neochef-menu"   && yarn build:web > /tmp/build-menu.log   2>&1 &
P2=$!
cd "${APPS_DIR}/neochef-events" && yarn build:web > /tmp/build-events.log 2>&1 &
P3=$!

FAIL=0
wait $P1 || FAIL=1
wait $P2 || FAIL=1
wait $P3 || FAIL=1

if [ $FAIL -ne 0 ]; then
  echo "!!! One or more builds FAILED. Logs at /tmp/build-*.log"
  tail -20 /tmp/build-taches.log /tmp/build-menu.log /tmp/build-events.log
  exit 1
fi

echo "==> Assembling into ${BUILD_DIR}..."
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"
cp -r "${APPS_DIR}/neochef-taches/dist" "${BUILD_DIR}/taches"
cp -r "${APPS_DIR}/neochef-menu/dist"   "${BUILD_DIR}/menu"
cp -r "${APPS_DIR}/neochef-events/dist" "${BUILD_DIR}/events"

# Landing page + serve.json rewrites
cp "${LANDING_SRC}"     "${BUILD_DIR}/index.html"
cp "${SERVE_JSON_SRC}"  "${BUILD_DIR}/serve.json"
# Restore original client menu (from dist.old)
mkdir -p "${BUILD_DIR}/client" "${BUILD_DIR}/_fresh/static/js/web"
cp "/app/backend/dist.old/client/[restaurant_id].html" "${BUILD_DIR}/client/" 2>/dev/null || true
cp "/app/backend/dist.old/_fresh/static/js/web/entry-1773093333-force.js" "${BUILD_DIR}/_fresh/static/js/web/" 2>/dev/null || true
cp -rn "/app/backend/dist.old/_expo"  "${BUILD_DIR}/" 2>/dev/null || true
cp -rn "/app/backend/dist.old/assets" "${BUILD_DIR}/" 2>/dev/null || true
# NeoChef logo (referenced by /neochef-logo.png in the landing HTML)
cp /app/scripts/neochef-logo.png "${BUILD_DIR}/neochef-logo.png" 2>/dev/null || true

# Copy favicon from taches for the landing page
cp "${BUILD_DIR}/taches/favicon.ico" "${BUILD_DIR}/favicon.ico" 2>/dev/null || true

echo "==> Post-processing per-app index.html (strip SW, fix baseUrl on manifest/apple-touch)..."
python3 /app/scripts/postprocess-builds.py

echo "==> Build complete. Restart frontend with: sudo supervisorctl restart frontend"
du -sh "${BUILD_DIR}"
