# HermitClaw — Agent Status File

> **Read this first.** This file is the single source of truth for any agent resuming work on this project.

---

## Current State

**Active Phase:** Phase 3 — Tide Pool UI (not started)
**Last Session:** `003-phase-2-execute-gateway`
**Build status:** `tsc` compiles clean. Docker not yet verified (requires Docker daemon).

---

## Project Summary

HermitClaw is a self-hosted, secure tool execution gateway and credential vault for AI agents ("Clawbots"). Agents are sandboxed with no internet access and must route all tool calls through the Shell, which injects credentials and audits everything.

Full design: [`DESIGN.md`](../DESIGN.md)
Full plan: [`PLAN.md`](../PLAN.md)

---

## Phase Checklist

- [x] **Phase 0 — Repo Scaffold** — complete (`001-phase-0-scaffold.md`)
- [x] **Phase 1 — Crypto + Vault** — complete (`002-phase-1-crypto-vault.md`)
- [x] **Phase 2 — Execute Gateway** — complete (`003-phase-2-execute-gateway.md`)
- [ ] **Phase 3 — Tide Pool UI** — not started *(swapped with Python example — UI makes system operable sooner)*
- [ ] **Phase 4 — Python Example Agent** — not started
- [ ] **Phase 5 — Ingress Routing** — deferred (post-MVP)

---

## What To Do Next

Start **Phase 3 — Tide Pool UI** (React dashboard):

1. Scaffold React + Vite app in `web/`
2. Build pages:
   - **Agents** — list crabs, register new agent, kill switch (PATCH revoke)
   - **Secrets** — list pearls per agent, add/delete secrets
   - **Audit Log** — paginated view of `tides` table
3. Wire Fastify to serve `web/dist` statically via `@fastify/static` on `GET /`
4. Verify: full secret CRUD via UI, kill switch revokes agent access

> **Important:** Run `prisma generate` once Docker/DB is up: `npm run db:generate` then `npm run db:migrate`

> **Deferred hardening for execute route (from session 003):**
> - Block private IP ranges in SSRF guard (10.x, 172.16.x, 192.168.x)
> - Per-crab rate limiting
> - Request timeout on undici calls (~30s)
> - Fastify JSON Schema validation on request bodies

---

## Repo Structure (current)

```
hermitClaw/
├── src/
│   ├── index.ts          # Fastify entry point, /health route
│   ├── routes/
│   │   ├── crabs.ts      # Agent registration + kill switch
│   │   ├── secrets.ts    # Encrypted credential CRUD
│   │   └── execute.ts    # POST /v1/execute — the gateway
│   └── lib/
│       ├── auth.ts       # requireCrab prehandler
│       ├── crypto.ts     # AES-256-GCM encrypt/decrypt
│       ├── db.ts         # Prisma client singleton
│       └── injector.ts   # Credential injection strategies
├── web/                  # Empty — Phase 4
├── examples/             # Empty — Phase 3
│   └── python_bot/
├── infra/                # Empty — future k8s/terraform
├── prisma/
│   └── schema.prisma     # crabs, pearls, tides, routes tables
├── dist/                 # Compiled output (gitignored)
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── .env.example
├── DESIGN.md
├── PLAN.md
└── coding_agent_logs/
    ├── STATUS.md         # This file
    └── sessions/
        └── 001-phase-0-scaffold.md
```

---

## Key Decisions & Constraints

- **Runtime:** Node.js 22 + TypeScript (strict, NodeNext modules)
- **Framework:** Fastify v5
- **ORM:** Prisma with PostgreSQL 16
- **Encryption:** AES-256-GCM via Node `crypto` (no external crypto libs)
- **HTTP client:** `undici` (built into Node, no axios)
- **UI:** React + Vite (Phase 4, served statically by Shell)
- **Networks:** `sand_bed` (internal, no internet) / `open_ocean` (bridge)
- **Secret:** `MASTER_PEARL` env var — 32-byte hex key, must be set before any vault operations
- **TypeScript must compile with zero errors** before any phase is considered done

---

## Known Issues / Deferred

- Docker build not yet verified end-to-end (needs Docker daemon running)
- `pino-pretty` is in `dependencies` — should move to `devDependencies` before production
