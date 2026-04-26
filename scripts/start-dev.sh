#!/usr/bin/env bash
# start-dev.sh - Start Climb512 in bind-mounted Next.js development mode
# Usage: ./scripts/start-dev.sh [--build] [--fresh] [--logs]
#
# Flags:
#   --build   Force rebuild of the dev web image
#   --fresh   Destroy existing data and dev dependency/cache volumes
#   --logs    Tail web logs after starting

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BUILD_FLAG=""
FRESH=false
FOLLOW_LOGS=false
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.dev.yml)

for arg in "$@"; do
  case $arg in
    --build) BUILD_FLAG="--build" ;;
    --fresh) FRESH=true ;;
    --logs) FOLLOW_LOGS=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

cd "$REPO_ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

if [ "$FRESH" = true ]; then
  echo "-- Removing existing app data and dev volumes..."
  docker compose "${COMPOSE_FILES[@]}" down -v 2>/dev/null || true
fi

echo "-- Starting Climb512 in development mode..."
# shellcheck disable=SC2086
docker compose "${COMPOSE_FILES[@]}" up $BUILD_FLAG -d

echo ""
echo "  Climb512 dev server is running at http://localhost:8080"
echo "  Source changes in ./app are bind-mounted into the web container."
echo ""
echo "  Useful commands:"
echo "    docker compose -f docker-compose.yml -f docker-compose.dev.yml logs web -f"
echo "    ./scripts/stop-dev.sh"
echo "    ./scripts/start.sh --build    # production-style image rebuild"
echo ""

if [ "$FOLLOW_LOGS" = true ]; then
  docker compose "${COMPOSE_FILES[@]}" logs web -f
fi
