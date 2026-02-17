#!/usr/bin/env bash
# dev.sh — Start the full HermitClaw local development environment.
#
# Usage: npm run dev  (or ./scripts/dev.sh)
#
# What this does:
#   1. Verifies .env exists (exits with instructions if not)
#   2. Starts the PostgreSQL container (hermit_db only — not the full stack)
#   3. Waits for the DB to be healthy
#   4. Runs prisma db push (idempotent — safe every time, catches schema changes)
#   5. Starts backend (tsx watch) + frontend (Vite) concurrently
#
# Prerequisites: Docker Desktop running, .env configured (see README).

set -euo pipefail

# ── 1. Check .env ─────────────────────────────────────────────────────────────
if [[ ! -f ".env" ]]; then
  echo ""
  echo "  ERROR: .env not found."
  echo ""
  echo "  Run the following to get started:"
  echo ""
  echo "    cp .env.example .env"
  echo "    echo \"MASTER_PEARL=\$(openssl rand -hex 32)\" >> .env"
  echo "    echo \"ADMIN_API_KEY=\$(openssl rand -hex 32)\" >> .env"
  echo ""
  exit 1
fi

# Check required keys are set (not blank)
MASTER_PEARL=$(grep -E '^MASTER_PEARL=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
ADMIN_API_KEY=$(grep -E '^ADMIN_API_KEY=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")

if [[ -z "$MASTER_PEARL" ]]; then
  echo "  ERROR: MASTER_PEARL is not set in .env"
  echo "  Generate one: echo \"MASTER_PEARL=\$(openssl rand -hex 32)\" >> .env"
  exit 1
fi

if [[ -z "$ADMIN_API_KEY" ]]; then
  echo "  ERROR: ADMIN_API_KEY is not set in .env"
  echo "  Generate one: echo \"ADMIN_API_KEY=\$(openssl rand -hex 32)\" >> .env"
  exit 1
fi

# ── 2. Start the database ──────────────────────────────────────────────────────
echo "▶  Starting database..."
docker compose up -d hermit_db 2>&1 | grep -v "^$" || true

# ── 3. Wait for DB healthy ─────────────────────────────────────────────────────
echo "▶  Waiting for database to be healthy..."
for i in $(seq 1 20); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' hermit_db 2>/dev/null || echo "missing")
  if [[ "$STATUS" == "healthy" ]]; then
    echo "   Database is ready."
    break
  fi
  if [[ $i -eq 20 ]]; then
    echo "   ERROR: Database did not become healthy after 20 attempts."
    echo "   Check: docker compose logs hermit_db"
    exit 1
  fi
  sleep 1
done

# ── 4. Push schema ─────────────────────────────────────────────────────────────
echo "▶  Syncing database schema..."
npx prisma db push --skip-generate 2>&1 | grep -E "(sync|push|error|Error)" || true
echo "   Schema up to date."

# ── 5. Start backend + frontend concurrently ──────────────────────────────────
echo ""
echo "▶  Starting backend and frontend..."
echo "   Backend:  http://localhost:3000"
echo "   Frontend: http://localhost:5173"
echo "   Sign in with ADMIN_API_KEY from .env"
echo ""

npx concurrently \
  --names "backend,frontend" \
  --prefix-colors "cyan,magenta" \
  --kill-others \
  --kill-others-on-fail \
  "tsx watch src/index.ts" \
  "cd web && npm run dev"
