#!/usr/bin/env bash
# clawbots-sync.sh — Idempotent convergence from clawbots.yml.
#
# Usage:
#   ./scripts/clawbots-sync.sh [--dry-run]
#
# Reads clawbots.yml and ensures each declared agent exists in HermitClaw.
# Already-registered agents are left unchanged (their tokens are not rotated).
# Agents not declared in clawbots.yml are NOT removed automatically — use
# clawbot-remove.sh for explicit teardown.
#
# clawbots.yml format (see clawbots.yml.example):
#   agents:
#     - name: openclaw
#       image: ghcr.io/openclaw/openclaw:latest
#       uiPort: 3001
#     - name: my-bot
#       image: myregistry/mybot:v2

set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

CLAWBOTS_FILE="${CLAWBOTS_FILE:-clawbots.yml}"

if [[ ! -f "$CLAWBOTS_FILE" ]]; then
  echo "Error: ${CLAWBOTS_FILE} not found. Copy clawbots.yml.example to get started." >&2
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

# Parse clawbots.yml with Python (no external YAML dep required on the host)
AGENTS=$(python3 - <<'PYEOF'
import sys, re

with open("${CLAWBOTS_FILE}") as f:
    content = f.read()

# Minimal YAML parser: extract agent blocks
agents = []
current = {}
for line in content.splitlines():
    m = re.match(r'^\s+-\s+name:\s+(\S+)', line)
    if m:
        if current:
            agents.append(current)
        current = {'name': m.group(1)}
    m2 = re.match(r'^\s+image:\s+(\S+)', line)
    if m2 and current:
        current['image'] = m2.group(1)
    m3 = re.match(r'^\s+uiPort:\s+(\d+)', line)
    if m3 and current:
        current['uiPort'] = m3.group(1)
if current:
    agents.append(current)

for a in agents:
    ui = a.get('uiPort', '')
    print(f"{a['name']}|{a.get('image','')}|{ui}")
PYEOF
)

# Replace the Python heredoc variable (bash doesn't expand in heredocs by default)
AGENTS=$(CLAWBOTS_FILE="$CLAWBOTS_FILE" python3 -c "
import sys, re, os
with open(os.environ['CLAWBOTS_FILE']) as f:
    content = f.read()
agents = []
current = {}
for line in content.splitlines():
    import re as re2
    m = re2.match(r'^\s*-\s+name:\s+(\S+)', line)
    if m:
        if current: agents.append(current)
        current = {'name': m.group(1)}
    m2 = re2.match(r'^\s+image:\s+(\S+)', line)
    if m2 and current: current['image'] = m2.group(1)
    m3 = re2.match(r'^\s+uiPort:\s+(\d+)', line)
    if m3 and current: current['uiPort'] = m3.group(1)
if current: agents.append(current)
for a in agents:
    print(f\"{a['name']}|{a.get('image','')}|{a.get('uiPort','')}\")
")

# Fetch existing crabs
EXISTING=$(curl -s "${BASE_URL}/v1/crabs" -H "x-admin-api-key: ${ADMIN_KEY}")

echo "Syncing agents from ${CLAWBOTS_FILE}..."

while IFS='|' read -r NAME IMAGE UI_PORT; do
  [[ -z "$NAME" ]] && continue

  # Check if crab already exists
  EXISTING_ID=$(echo "$EXISTING" | python3 -c "
import sys, json
crabs = json.load(sys.stdin).get('crabs', [])
match = next((c for c in crabs if c['name'] == '${NAME}'), None)
print(match['id'] if match else '')
" 2>/dev/null || true)

  if [[ -n "$EXISTING_ID" ]]; then
    echo "  [OK] ${NAME} already registered (id: ${EXISTING_ID})"
  else
    echo "  [+] Registering ${NAME}..."
    if [[ "$DRY_RUN" == "false" ]]; then
      bash scripts/clawbot-add.sh "${NAME}" "${UI_PORT}"
    else
      echo "      (dry-run: would call clawbot-add.sh ${NAME} ${UI_PORT})"
    fi
  fi
done <<< "$AGENTS"

echo "Sync complete."
