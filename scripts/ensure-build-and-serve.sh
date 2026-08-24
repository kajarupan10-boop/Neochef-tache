#!/usr/bin/env bash
# Ensure /app/frontend/build/ exists (assembling it from each app's dist/) before starting `serve`.
# This makes the preview resilient to container restarts (build/ is ephemeral, dist/ persists in the apps).
# If any dist/ is missing, run the full rebuild pipeline.
set -euo pipefail

BUILD="/app/frontend/build"
APPS=(taches menu events)

need_rebuild=0

if [ ! -f "$BUILD/index.html" ]; then need_rebuild=1; fi
for a in "${APPS[@]}"; do
  if [ ! -f "$BUILD/$a/index.html" ]; then need_rebuild=1; fi
done

if [ $need_rebuild -eq 1 ]; then
  # Fast path: if per-app dist/ exists, just re-assemble (no yarn build needed).
  can_assemble=1
  for a in "${APPS[@]}"; do
    if [ ! -f "/app/apps/neochef-$a/dist/index.html" ]; then can_assemble=0; fi
  done

  if [ $can_assemble -eq 1 ]; then
    echo "[ensure-build] Assembling build/ from existing dist/ folders..."
    mkdir -p "$BUILD"
    for a in "${APPS[@]}"; do
      rm -rf "$BUILD/$a"
      cp -r "/app/apps/neochef-$a/dist" "$BUILD/$a"
    done
    cp /app/scripts/landing-index.html "$BUILD/index.html"
    cp /app/scripts/landing-serve.json "$BUILD/serve.json"
    # Restore original client menu page + its JS bundle from dist.old (was lost in tree-shaking)
    mkdir -p "$BUILD/client" "$BUILD/_fresh/static/js/web"
    cp "/app/backend/dist.old/client/[restaurant_id].html" "$BUILD/client/" 2>/dev/null || true
    cp "/app/backend/dist.old/_fresh/static/js/web/entry-1773093333-force.js" "$BUILD/_fresh/static/js/web/" 2>/dev/null || true
    cp -rn "/app/backend/dist.old/_expo" "$BUILD/" 2>/dev/null || true
    cp -rn "/app/backend/dist.old/assets" "$BUILD/" 2>/dev/null || true
    cp /app/scripts/neochef-logo.png   "$BUILD/neochef-logo.png" 2>/dev/null || true
    cp "$BUILD/taches/favicon.ico"     "$BUILD/favicon.ico" 2>/dev/null || true
    python3 /app/scripts/postprocess-builds.py
  else
    echo "[ensure-build] Some dist/ missing — running full build pipeline..."
    bash /app/scripts/build-all-apps.sh
  fi
else
  echo "[ensure-build] build/ already ready — skipping."
fi

echo "[ensure-build] Starting serve..."
exec yarn --cwd /app/frontend start
