#!/usr/bin/env bash
# start.sh — Start Climb512 using Docker Compose
# Usage: ./scripts/start.sh [--build]
#
# Flags:
#   --build   Force rebuild of the web image (use after code changes)
#   --fresh   Destroy existing data volume and start clean
#   --logs    Tail logs after starting

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BUILD_FLAG=""
FRESH=false
FOLLOW_LOGS=false

for arg in "$@"; do
  case $arg in
    --build) BUILD_FLAG="--build" ;;
    --fresh) FRESH=true ;;
    --logs)  FOLLOW_LOGS=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

cd "$REPO_ROOT"

# Verify Docker is running
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

# Optionally wipe data volume
if [ "$FRESH" = true ]; then
  echo "-- Removing existing data volume..."
  docker compose down -v 2>/dev/null || true
fi

echo "-- Starting Climb512..."
# shellcheck disable=SC2086
docker compose up $BUILD_FLAG -d

# Wait for web to be healthy
echo "-- Waiting for web container..."
for i in $(seq 1 30); do
  STATUS=$(docker compose ps --format json web 2>/dev/null | grep -o '"Status":"[^"]*"' | cut -d'"' -f4 || echo "")
  if echo "$STATUS" | grep -q "running\|Up"; then
    break
  fi
  sleep 1
done

echo ""
echo "  Climb512 is running at http://localhost:3000"
echo "  Login: climber1 / climbin512!"
echo ""
echo "  Useful commands:"
echo "    docker compose logs web -f     # follow app logs"
echo "    ./scripts/stop.sh              # stop"
echo "    ./scripts/start.sh --build     # rebuild after code changes"
echo ""

if [ "$FOLLOW_LOGS" = true ]; then
  docker compose logs web -f
fi
