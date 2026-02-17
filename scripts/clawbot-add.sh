#!/usr/bin/env bash
# clawbot-add.sh — Register and provision a clawbot (agent container) with HermitClaw.
#
# Usage:
#   ./scripts/clawbot-add.sh <name> [ui-port]
#
#   <name>     Unique name for the agent (also becomes the Docker container name).
#   [ui-port]  Optional. If the agent exposes a web UI, set this to its internal port.
#              The Hermit Shell will proxy the UI at /agents/<name>/
#
# Prerequisites:
#   - HERMITCLAW_BASE_URL  URL of the running Hermit Shell (default: http://localhost:3000)
#   - ADMIN_API_KEY        Admin API key (or set in .env)
#
# What this script does:
#   1. Calls POST /v1/crabs to register the agent and capture its bearer token.
#   2. If ui-port is provided, sets uiPort on the crab record via PATCH /v1/crabs/<id>.
#   3. Writes the token and base URL into a Docker secret or env file the agent can consume.
#   4. Prints the docker run command to start the agent on sand_bed.
#
# The token is printed once. Store it securely — HermitClaw does not store it in plaintext.

set -euo pipefail

NAME="${1:-}"
UI_PORT="${2:-}"

if [[ -z "$NAME" ]]; then
  echo "Usage: $0 <name> [ui-port]" >&2
  exit 1
fi

BASE_URL="${HERMITCLAW_BASE_URL:-http://localhost:3000}"
ADMIN_KEY="${ADMIN_API_KEY:-}"

if [[ -z "$ADMIN_KEY" ]]; then
  # Try loading from .env
  if [[ -f ".env" ]]; then
    # shellcheck disable=SC1091
    ADMIN_KEY=$(grep -E '^ADMIN_API_KEY=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
  fi
fi

if [[ -z "$ADMIN_KEY" ]]; then
  echo "Error: ADMIN_API_KEY is not set. Export it or add it to .env" >&2
  exit 1
fi

echo "Registering agent '${NAME}' with HermitClaw at ${BASE_URL}..."

# Step 1: Create the crab
RESPONSE=$(curl -s -X POST "${BASE_URL}/v1/crabs" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: ${ADMIN_KEY}" \
  -d "{\"name\": \"${NAME}\"}")

TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['token'])" 2>/dev/null || true)
CRAB_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])" 2>/dev/null || true)

if [[ -z "$TOKEN" || -z "$CRAB_ID" ]]; then
  echo "Error: Failed to create agent. Response:" >&2
  echo "$RESPONSE" >&2
  exit 1
fi

echo "Agent registered. ID: ${CRAB_ID}"

# Step 2: Set uiPort if provided
if [[ -n "$UI_PORT" ]]; then
  UPDATE_RESP=$(curl -s -X PATCH "${BASE_URL}/v1/crabs/${CRAB_ID}" \
    -H "Content-Type: application/json" \
    -H "x-admin-api-key: ${ADMIN_KEY}" \
    -d "{\"uiPort\": ${UI_PORT}}")
  echo "uiPort set to ${UI_PORT}. UI will be accessible at ${BASE_URL}/agents/${NAME}/"
fi

# Step 3: Write env file for the agent container
ENV_FILE=".clawbots/${NAME}.env"
mkdir -p .clawbots
cat > "${ENV_FILE}" <<EOF
HERMITCLAW_TOKEN=${TOKEN}
HERMITCLAW_BASE_URL=${BASE_URL}
HTTP_PROXY=http://hermit_shell:3000
HTTPS_PROXY=http://hermit_shell:3000
NO_PROXY=hermit_shell
EOF
chmod 600 "${ENV_FILE}"
echo "Env file written to ${ENV_FILE} (mode 600)"

# Step 4: Print docker run template
echo ""
echo "─────────────────────────────────────────────────────────────"
echo " Agent token (copy now — shown once only):"
echo ""
echo "  ${TOKEN}"
echo ""
echo " Docker run template:"
echo ""
echo "  docker run -d \\"
echo "    --name ${NAME} \\"
echo "    --network hermitclaw_sand_bed \\"
echo "    --read-only \\"
echo "    --tmpfs /tmp:size=128m,noexec,nosuid \\"
echo "    --env-file .clawbots/${NAME}.env \\"
echo "    <IMAGE>   # replace with your agent image"
echo ""
echo " Or add the service to docker-compose.yml (see the commented openclaw"
echo " block for a template) and run: docker compose up -d ${NAME}"
echo "─────────────────────────────────────────────────────────────"
