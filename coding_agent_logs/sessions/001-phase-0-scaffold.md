# Session 001 — Phase 0: Repo Scaffold

**Date:** 2026-02-16
**Agent:** Claude (claude-sonnet-4-5)
**Phase:** 0 — Repo Scaffold
**Status:** Complete

---

## Goal

Get the repo initialized with a working skeleton: directory structure, TypeScript config, Fastify server with a health check, Docker Compose with correct network topology, and a Dockerfile. Everything compiles; `docker compose up` should bring up Shell + Postgres.

---

## Work Done

### Repo Initialization
- Initialized git repo with `main` branch
- Created GitHub repo at `https://github.com/elfisher/hermitClaw` via `gh repo create`
- Added `.gitignore` (Node.js — ignores `node_modules`, `.env`, `dist`, `.tmp`)

### Documentation
- `DESIGN.md` — full design document (pasted from user clipboard)
- `PLAN.md` — phased implementation plan (5 phases + deferred ingress)

### Directory Structure
```
src/routes/     — future API routes
src/lib/        — future shared utilities (crypto, db)
web/            — future React dashboard
examples/python_bot/  — future sandboxed example agent
infra/          — future deployment config
```

### Files Created

| File | Purpose |
|------|---------|
| `src/index.ts` | Fastify entry point. Registers `/health` route returning `{ status, service, version }`. Listens on `0.0.0.0:3000`. |
| `package.json` | Dependencies: fastify, @prisma/client, undici, pino-pretty, @fastify/static. Dev: typescript, tsx, prisma, @types/node. |
| `tsconfig.json` | Strict TypeScript. Target ES2022, NodeNext module resolution. `src/` → `dist/`. |
| `docker-compose.yml` | `hermit_shell` (Shell) + `hermit_db` (Postgres 16). Networks: `sand_bed` (internal) and `open_ocean` (bridge). DB healthcheck before Shell starts. |
| `Dockerfile` | Multi-stage build. Builder: Node 22 Alpine + `tsc`. Runner: production deps only + compiled `dist/`. |
| `.env.example` | Template with `MASTER_PEARL` (generate: `openssl rand -hex 32`), `DATABASE_URL`, `PORT`, `HOST`, `NODE_ENV`. |

### Verification
- `npx tsc --noEmit` — zero errors
- `npm run build` — compiles cleanly to `dist/`
- Docker verify: **pending** (Docker daemon was not running during session)

---

## Decisions Made

- **Fastify v5** over Express — better TypeScript support, schema validation built-in
- **undici** over axios/node-fetch — ships with Node 18+, no extra dependency
- **pino-pretty** added to `dependencies` (not devDependencies) so it's available in the Docker runner stage during development. Should be moved to devDependencies before a production release.
- **`version:` removed** from `docker-compose.yml` — it's deprecated in current Docker Compose and generates a warning
- **NodeNext module resolution** — required for ESM compatibility with Fastify v5

---

## Commits

| Hash | Message |
|------|---------|
| `b835c60` | chore: init repo with design document |
| `72d3a7a` | docs: add phased implementation plan |
| `32363a5` | feat: phase 0 — repo scaffold |
