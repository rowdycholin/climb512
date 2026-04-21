#!/usr/bin/env bash
# stop.sh — Stop Climb512
# Usage: ./scripts/stop.sh [--clean]
#
# Flags:
#   --clean   Also remove the postgres data volume (DELETES ALL DATA)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CLEAN=false
for arg in "$@"; do
  case $arg in
    --clean) CLEAN=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

cd "$REPO_ROOT"

if [ "$CLEAN" = true ]; then
  echo "-- Stopping Climb512 and removing data volume..."
  read -rp "This will delete all stored training plans and logs. Continue? [y/N] " confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    docker compose down -v
    echo "-- Stopped and data removed."
  else
    echo "-- Aborted."
    exit 0
  fi
else
  echo "-- Stopping Climb512 (data preserved)..."
  docker compose down
  echo "-- Stopped."
fi
