# HermitClaw — Agent Status File

> **Read this first.** This file is the single source of truth for any agent resuming work on this project.

---

## Current State

**Active Phase:** Phase 1 — Crypto + Vault (not started)
**Last Session:** `001-phase-0-scaffold`
**Build status:** `tsc` compiles clean. Docker not yet verified (requires Docker daemon).

---

## Project Summary

HermitClaw is a self-hosted, secure tool execution gateway and credential vault for AI agents ("Clawbots"). Agents are sandboxed with no internet access and must route all tool calls through the Shell, which injects credentials and audits everything.

Full design: [`DESIGN.md`](../DESIGN.md)
Full plan: [`PLAN.md`](../PLAN.md)

---

## Phase Checklist

- [x] **Phase 0 — Repo Scaffold** — complete (`001-phase-0-scaffold.md`)
- [ ] **Phase 1 — Crypto + Vault** — not started
- [ ] **Phase 2 — Execute Gateway** — not started (MVP core)
- [ ] **Phase 3 — Python Example Agent** — not started
- [ ] **Phase 4 — Tide Pool UI** — not started
- [ ] **Phase 5 — Ingress Routing** — deferred (post-MVP)

---

## What To Do Next

Start **Phase 1 — Crypto + Vault**:

1. Initialize Prisma: `npx prisma init`
2. Write schema (`prisma/schema.prisma`): tables `crabs`, `pearls`, `tides`, `routes`
3. Implement `src/lib/crypto.ts` — AES-256-GCM `encryptPearl` / `decryptPearl`
4. Implement `src/lib/db.ts` — Prisma client singleton
5. Create secrets API routes:
   - `POST /v1/secrets` — store encrypted credential for an agent
   - `GET /v1/secrets` — list secrets (keys only, no plaintext values)
6. Run migration: `npm run db:migrate`
7. Verify: store a secret via curl, confirm DB row is encrypted

---

## Repo Structure (current)

```
hermitClaw/
├── src/
│   └── index.ts          # Fastify entry point, /health route
├── web/                  # Empty — Phase 4
├── examples/             # Empty — Phase 3
│   └── python_bot/
├── infra/                # Empty — future k8s/terraform
├── prisma/               # Does not exist yet — Phase 1
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
