#!/usr/bin/env bash
# start.sh - Start Climb512 using Docker Compose
# Usage: ./scripts/start.sh [--build] [--fresh] [--logs] [--guardrails] [--no-recreate]
#
# Flags:
#   --build       Force rebuild of app/simulator images (use after code changes)
#   --fresh       Destroy existing data volume and start clean
#   --logs        Tail logs after starting
#   --guardrails  Start the optional NeMo guardrails service profile
#   --no-recreate Start existing containers without recreating them

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BUILD=false
FRESH=false
FOLLOW_LOGS=false
GUARDRAILS=false
NO_RECREATE=false

for arg in "$@"; do
  case $arg in
    --build) BUILD=true ;;
    --fresh) FRESH=true ;;
    --logs) FOLLOW_LOGS=true ;;
    --guardrails) GUARDRAILS=true ;;
    --no-recreate) NO_RECREATE=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

if [ "$BUILD" = true ] && [ "$NO_RECREATE" = true ]; then
  echo "ERROR: --build and --no-recreate cannot be used together."
  exit 1
fi

cd "$REPO_ROOT"

guardrails_mode() {
  if [ ! -f app/.env ]; then
    echo "off"
    return
  fi

  local value
  value="$(grep -E '^AI_GUARDRAILS_MODE=' app/.env | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]' || true)"
  echo "${value:-off}"
}

AI_GUARDRAILS_MODE="$(guardrails_mode)"
if [ "$AI_GUARDRAILS_MODE" = "intake" ]; then
  GUARDRAILS=true
fi

compose() {
  if [ "$GUARDRAILS" = true ]; then
    docker compose --profile guardrails "$@"
  else
    docker compose "$@"
  fi
}

# Verify Docker is running.
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

# Optionally wipe data volume.
if [ "$FRESH" = true ]; then
  echo "-- Removing existing data volume..."
  compose down -v 2>/dev/null || true
fi

echo "-- Starting Climb512..."
if [ "$GUARDRAILS" = true ]; then
  echo "-- NeMo guardrails profile enabled."
  if [ "$AI_GUARDRAILS_MODE" != "intake" ]; then
    echo "-- Note: app/.env has AI_GUARDRAILS_MODE=$AI_GUARDRAILS_MODE, so web will not route intake through NeMo until it is set to intake."
  fi
else
  echo "-- NeMo guardrails profile disabled. Set AI_GUARDRAILS_MODE=intake or pass --guardrails to start it."
fi

if [ "$NO_RECREATE" = true ]; then
  echo "-- Compose will not recreate containers. This is useful in restricted Docker environments."
fi

if [ "$BUILD" = true ]; then
  compose up --build -d
elif [ "$NO_RECREATE" = true ]; then
  compose up --no-recreate -d
else
  compose up -d
fi

# Wait for web to be running.
echo "-- Waiting for web container..."
for _ in $(seq 1 30); do
  STATUS="$(compose ps --format json web 2>/dev/null | grep -o '"Status":"[^"]*"' | cut -d'"' -f4 || true)"
  if echo "$STATUS" | grep -q "running\|Up"; then
    break
  fi
  sleep 1
done

echo ""
echo "  Climb512 is running at http://localhost:8080"
echo "  Login: climber1 / climbin512!"
echo ""
echo "  Useful commands:"
echo "    docker compose logs web -f"
echo "    docker compose logs plan-worker simulator -f"
echo "    docker compose --profile guardrails logs guardrails -f"
echo "    ./scripts/stop.sh"
echo "    ./scripts/start.sh --build"
echo "    ./scripts/start.sh --guardrails --build"
echo "    ./scripts/start.sh --no-recreate"
echo ""

if [ "$FOLLOW_LOGS" = true ]; then
  compose logs web plan-worker simulator -f
fi
