#!/usr/bin/env bash
# clawbot-remove.sh — Revoke and teardown a clawbot.
#
# Usage:
#   ./scripts/clawbot-remove.sh <name> [--destroy-data]
#
#   <name>           Name of the agent to remove.
#   --destroy-data   Also delete the agent's Docker volume (<name>_data).
#                    WARNING: This is irreversible.
#
# What this script does:
#   1. Stops and removes the agent container (if running).
#   2. Revokes the crab token in HermitClaw.
#   3. Removes the env file from .clawbots/<name>.env.
#   4. Optionally destroys the agent's data volume.

set -euo pipefail

NAME="${1:-}"
DESTROY_DATA=false

for arg in "$@"; do
  [[ "$arg" == "--destroy-data" ]] && DESTROY_DATA=true
done

if [[ -z "$NAME" ]]; then
  echo "Usage: $0 <name> [--destroy-data]" >&2
  exit 1
fi

BASE_URL="${HERMITCLAW_BASE_URL:-http://localhost:3000}"
ADMIN_KEY="${ADMIN_API_KEY:-}"

if [[ -z "$ADMIN_KEY" ]] && [[ -f ".env" ]]; then
  ADMIN_KEY=$(grep -E '^ADMIN_API_KEY=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

if [[ -z "$ADMIN_KEY" ]]; then
  echo "Error: ADMIN_API_KEY is not set." >&2
  exit 1
fi

echo "Removing agent '${NAME}'..."

# Step 1: Stop and remove Docker container
if docker ps -a --format '{{.Names}}' | grep -qx "${NAME}"; then
  echo "Stopping container ${NAME}..."
  docker stop "${NAME}" 2>/dev/null || true
  docker rm "${NAME}" 2>/dev/null || true
  echo "Container removed."
else
  echo "Container '${NAME}' not found (may already be stopped)."
fi

# Step 2: Revoke the crab in HermitClaw
CRABS=$(curl -s "${BASE_URL}/v1/crabs" \
  -H "x-admin-api-key: ${ADMIN_KEY}")

CRAB_ID=$(echo "$CRABS" | python3 -c "
import sys, json
crabs = json.load(sys.stdin).get('crabs', [])
match = next((c for c in crabs if c['name'] == '${NAME}'), None)
print(match['id'] if match else '')
" 2>/dev/null || true)

if [[ -n "$CRAB_ID" ]]; then
  curl -s -X PATCH "${BASE_URL}/v1/crabs/${CRAB_ID}/revoke" \
    -H "x-admin-api-key: ${ADMIN_KEY}" > /dev/null
  echo "Crab token revoked (id: ${CRAB_ID})."
else
  echo "Agent '${NAME}' not found in HermitClaw (may already be removed)."
fi

# Step 3: Remove env file
ENV_FILE=".clawbots/${NAME}.env"
if [[ -f "$ENV_FILE" ]]; then
  rm "$ENV_FILE"
  echo "Env file ${ENV_FILE} removed."
fi

# Step 4: Optionally destroy data volume
if [[ "$DESTROY_DATA" == "true" ]]; then
  VOLUME="${NAME}_data"
  if docker volume ls --format '{{.Name}}' | grep -qx "${VOLUME}"; then
    echo "WARNING: Destroying volume ${VOLUME} — this is irreversible."
    docker volume rm "${VOLUME}"
    echo "Volume ${VOLUME} destroyed."
  else
    echo "Volume '${VOLUME}' not found."
  fi
fi

echo "Done. Agent '${NAME}' has been removed."
