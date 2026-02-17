#!/bin/bash
#
# This script starts the complete HermitClaw development environment.
# It brings up the backend Docker containers and starts the frontend Vite dev server.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- 1. Start Docker Backend ---
echo "▶️  Starting Docker containers for the backend (hermit_shell, hermit_db)..."
docker-compose up -d

# --- 2. Start Frontend Dev Server ---
echo "▶️  Starting the frontend Vite dev server..."
echo "    The UI will be available at http://localhost:5173"
cd web
npm run dev
