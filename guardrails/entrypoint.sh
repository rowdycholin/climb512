#!/bin/sh
set -eu

CONFIG_ROOT="${NEMO_CONFIG_ROOT:-/tmp/guardrails-configs}"
CONFIG_ID="${NEMO_CONFIG_ID:-intake}"
PORT="${NEMO_PORT:-8000}"

MAIN_MODEL="${ANTHROPIC_MODEL:-${OPENAI_MODEL:-gpt-4o-mini}}"
RAW_BASE_URL="${ANTHROPIC_BASE_URL:-${OPENAI_API_BASE:-https://api.openai.com}}"
OPENAI_BASE_URL="${RAW_BASE_URL%/}"
case "$OPENAI_BASE_URL" in
  */v1) ;;
  *) OPENAI_BASE_URL="${OPENAI_BASE_URL}/v1" ;;
esac

export OPENAI_API_KEY="${ANTHROPIC_API_KEY:-${OPENAI_API_KEY:-}}"

mkdir -p "${CONFIG_ROOT}/${CONFIG_ID}/rails"

sed \
  -e "s|__MAIN_MODEL__|${MAIN_MODEL}|g" \
  -e "s|__OPENAI_BASE_URL__|${OPENAI_BASE_URL}|g" \
  "/configs-src/intake/config.template.yml" > "${CONFIG_ROOT}/${CONFIG_ID}/config.yml"

cp /configs-src/intake/rails/*.co "${CONFIG_ROOT}/${CONFIG_ID}/rails/"
cp /configs-src/intake/actions.py "${CONFIG_ROOT}/${CONFIG_ID}/actions.py"
cp /configs-src/intake/prompts.yml "${CONFIG_ROOT}/${CONFIG_ID}/prompts.yml"

echo "[guardrails] starting NeMo config=${CONFIG_ID} model=${MAIN_MODEL} baseUrl=${OPENAI_BASE_URL}"

exec nemoguardrails server \
  --config "${CONFIG_ROOT}" \
  --default-config-id "${CONFIG_ID}" \
  --port "${PORT}" \
  --disable-chat-ui
