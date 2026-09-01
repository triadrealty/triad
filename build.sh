#!/usr/bin/env bash
# build.sh — Used by Render (and CI) to build the full stack.
#
# When invoked by Render, rootDir is set to "backend", so the script
# is called from the backend/ directory. We navigate up to build the
# React frontend first, then copy the output into backend/frontend_build/,
# and finally install Python dependencies.
#
# Usage (from project root):
#   cd backend && ../build.sh
# Or let Render invoke it automatically via render.yaml.

set -e  # Exit immediately on any error

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SCRIPT_DIR/frontend" ]; then
  PROJECT_ROOT="$SCRIPT_DIR"
else
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"
BUILD_OUTPUT="$BACKEND_DIR/frontend_build"

echo "=== [1/4] Building React frontend ==="
cd "$FRONTEND_DIR"
npm install --legacy-peer-deps
npm run build
echo "    React build complete: $FRONTEND_DIR/build"

echo "=== [2/4] Copying frontend build into backend ==="
rm -rf "$BUILD_OUTPUT"
cp -r "$FRONTEND_DIR/build" "$BUILD_OUTPUT"
echo "    Deployed to: $BUILD_OUTPUT"

echo "=== [3/4] Returning to backend ==="
cd "$BACKEND_DIR"

echo "=== [4/4] Installing Python dependencies ==="
pip install -r requirements.txt

echo ""
echo "=== Build complete ==="
echo "    Start the server with:  uvicorn server:app --host 0.0.0.0 --port 8000"
