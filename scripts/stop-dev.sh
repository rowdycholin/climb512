#!/usr/bin/env bash
# stop-dev.sh - Stop Climb512 development compose stack
# Usage: ./scripts/stop-dev.sh [--clean]
#
# Flags:
#   --clean   Also remove postgres data and dev dependency/cache volumes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.dev.yml)

CLEAN=false
for arg in "$@"; do
  case $arg in
    --clean) CLEAN=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

cd "$REPO_ROOT"

if [ "$CLEAN" = true ]; then
  echo "-- Stopping Climb512 dev mode and removing volumes..."
  read -rp "This deletes Postgres data plus dev dependency/cache volumes. Continue? [y/N] " confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    docker compose "${COMPOSE_FILES[@]}" down -v
    echo "-- Stopped and volumes removed."
  else
    echo "-- Aborted."
  fi
else
  echo "-- Stopping Climb512 dev mode (volumes preserved)..."
  docker compose "${COMPOSE_FILES[@]}" down
  echo "-- Stopped."
fi
