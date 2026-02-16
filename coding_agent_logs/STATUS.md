# HermitClaw — Agent Status File

> **Read this first.** This file is the single source of truth for any agent resuming work on this project.

---

## Current State

**Active Phase:** Security Hardening (P1 and P2 completed)
**Last Session:** `007-security-hardening`
**Build status:** `tsc` clean. Vite build clean. 88/88 tests passing. Docker not yet verified (requires Docker daemon).

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
- [x] **Phase 3 — Tide Pool UI** — complete (`005-phase-3-tide-pool-ui.md`)
- [x] **Security Hardening (P0)** — complete (`007-security-hardening.md`)
- [x] **Security Hardening (P1)** — complete (partial, see backlog below)
- [x] **Security Hardening (P2)** — complete (partial, see backlog below)
- [ ] **Clawbot Provisioning** — design complete, not yet built (see below)
- [ ] **Phase 4 — Python Example Agent** — not started
- [ ] **Phase 5 — Ingress Routing** — deferred (post-MVP)
- [ ] **Phase 6 — Activity Monitor** — not started (design needed)
- [ ] **Phase 7 — Risk Scanner** — not started (design needed)

---

## What To Do Next

### Option A: Build Clawbot Provisioning System
Design is fully agreed. See "Clawbot Provisioning Design" section below.

### Option B: Security Hardening (Remaining P1/P2)
Several remaining P1/P2 issues should be fixed before provisioning is built on top of an insecure base. See "Security Backlog" section below.

**Suggested order:** Clawbot Provisioning → Security P1s → Python Example Agent

---

## Clawbot Provisioning Design

**Target:** Home server (Mac mini, isolated devices). Docker Compose + bash scripts. No orchestrator.

### Workspace Modes

Three modes controlled by `clawbots.yml`:

```yaml
clawbots:
  # Mode 1: Fully isolated — named Docker volume only, zero host FS exposure
  - name: dev-bot

  # Mode 2: Dedicated host path — one bot owns the directory
  - name: archive-bot
    workspace: ./workspaces/archive
    workspace_mode: ro

  # Mode 3: Shared group — multiple bots, same parent, each gets own subdir (MOST COMMON)
  - name: researcher-bot
    workspace: ./workspaces/project-x

  - name: writer-bot
    workspace: ./workspaces/project-x

  - name: reviewer-bot
    workspace: ./workspaces/project-x
    workspace_mode: ro
```

**Mode 3 mechanics:** When 2+ bots share the same `workspace` path, the provisioner mounts the full
shared path at `/workspace` and auto-creates `./workspaces/project-x/<botname>/` on the host.
Each bot gets `AGENT_HOME=/workspace/<botname>` env var pointing to its subdirectory.
Bots can read/write siblings per their `workspace_mode`.

### Volume Strategy (per container)

| Volume | Type | Path in container | Persists | Host accessible |
|--------|------|-------------------|----------|----------------|
| `hermit_state_<name>` | Named Docker volume | `/state` | Yes | No (inside VM) |
| `./workspaces/...` | Bind mount (opt-in) | `/workspace` | Yes | Yes (intentional) |
| — | tmpfs | `/tmp` | No | No |

### Container Security Profile (all clawbots)

```yaml
networks: [sand_bed]          # internal only — zero internet
read_only: true               # root filesystem immutable
user: "1000:1000"             # non-root
cap_drop: [ALL]               # drop all Linux capabilities
security_opt:
  - no-new-privileges:true
tmpfs:
  - /tmp:size=100m,noexec
mem_limit: 512m
cpus: 0.5
pids_limit: 64
```

### Token Delivery

Token written to `workspaces/<name>/.hermit_token` (chmod 600) by provisioning script.
Mounted read-only into container at `/run/hermit/token`.
Never in env vars, never in `docker inspect`.

### Agent Interface (runtime-agnostic)

Any container is a valid clawbot if it:
1. Reads token from `/run/hermit/token`
2. Calls `$SHELL_URL/v1/execute` with `Authorization: Bearer <token>`
3. (Optional, Phase 5) Exposes `POST /webhook` on port 8000

Two non-secret env vars injected at runtime:
- `SHELL_URL=http://hermit_shell:3000`
- `AGENT_NAME=<name>`

Default image: `hermitclaw/clawbot:latest` (runtime-agnostic, provide tested default).

### Scripts to Build

| Script | Purpose |
|--------|---------|
| `scripts/clawbot-add.sh <name> [--workspace path] [--image img]` | Register + provision one bot |
| `scripts/clawbot-remove.sh <name> [--keep-state] [--keep-workspace]` | Revoke + stop + optionally destroy data |
| `scripts/clawbots-sync.sh` | Idempotent — converge running containers to `clawbots.yml` |

### Files to Create

```
clawbots.yml              ← user edits this (committed)
clawbots.yml.example      ← template (committed)
workspaces/               ← gitignored
  <name>/
    .hermit_token         ← mode 600, gitignored
scripts/
  clawbot-add.sh
  clawbot-remove.sh
  clawbots-sync.sh
docker-compose.clawbots.yml  ← auto-generated, gitignored
examples/clawbot-base/
  Dockerfile
  README.md
```

---

## Security Backlog

> Full threat assessment documented in session `006-clawbot-provisioning-design`.
> Fix P0s before any public use or before building provisioning on top of this.

### P0 — Fix before real use

- [x] **Admin API auth** — `POST /v1/crabs`, `GET /v1/secrets`, `DELETE /v1/secrets/:id`,
  `PATCH /v1/crabs/:id/revoke`, `GET /v1/tides` are all unauthenticated. Anyone on the
  network can call them. **Fix:** `ADMIN_API_KEY` in `.env`, required header on all
  management routes. Gates the Tide Pool UI too (one fix, two problems solved).

- [x] **Tide Pool UI has no login** — same exposure as above. Fixed by admin API key.

- [x] **No tool allowlisting** — execute route validates *who* is calling but not *what*
  they can call. A prompt-injected agent with a valid token can call any URL with any
  method. **Fix:** add `allowedTools: [{ url, method }]` array to pearl schema. Execute
  route checks before proxying.

### P1 — High priority

- [x] **Incomplete SSRF guard** — private IP ranges not blocked (`10.x`, `172.16-31.x`,
  `192.168.x`). IPv6 loopback (`::1`) not blocked. DNS rebinding not mitigated.
  **Fix:** resolve URL to IP, check against RFC-1918 + loopback ranges before executing.

- [ ] **Default DB password** — `docker-compose.yml` ships `securepass`. Most users won't
  change it. **Fix:** require `DB_PASSWORD` env var, no hardcoded default. (SKIPPED)

- [ ] **No TLS** — Shell port is plain HTTP. Fine for isolated Mac mini, problem on shared
  networks. **Fix:** document reverse proxy requirement (nginx/Caddy) in README.

### P2 — Before sharing with others

- [ ] **Shell injection in provisioning scripts** — `<name>` param must be validated to
  `[a-z0-9-]` only before use in shell commands or YAML generation. (SKIPPED)

- [x] **No rate limiting on `/v1/execute`** — runaway agent can exhaust downstream API
  rate limits or DoS the Shell. **Fix:** per-crab rate limit (e.g. 60 req/min).

- [x] **No request timeout on outbound calls** — slow upstream hangs connection indefinitely.
  **Fix:** 30s timeout on undici requests.

- [ ] **No token rotation** — tokens are permanent until manually revoked. No expiry.
  **Fix:** optional `expiresAt` field on crabs table, checked in `requireCrab`. (SKIPPED)

### P3 — Known tradeoffs, document only

- Mode 3 bots can read/write each other's subdirectories — intentional, document it.
- `MASTER_PEARL` in `.env` means host compromise = vault compromise — inherent limitation
  of self-hosted encryption, document clearly.
- `.hermit_token` readable by host user — acceptable for single-user home server.

---

## Repo Structure (current)

```
hermitClaw/
├── src/
│   ├── index.ts              # Fastify entry point + static serve
│   ├── routes/
│   │   ├── crabs.ts          # Agent registration + kill switch
│   │   ├── secrets.ts        # Encrypted credential CRUD
│   │   ├── execute.ts        # POST /v1/execute — the gateway
│   │   └── tides.ts          # GET /v1/tides — audit log
│   └── lib/
│       ├── auth.ts           # requireCrab prehandler
│       ├── crypto.ts         # AES-256-GCM encrypt/decrypt
│       ├── db.ts             # Prisma client singleton
│       └── injector.ts       # Credential injection strategies
├── web/                      # Tide Pool UI (React + Vite + Tailwind)
│   └── src/
│       ├── App.tsx           # Tab shell
│       ├── api/              # Typed fetch client
│       └── pages/            # AgentsPage, SecretsPage, AuditLogPage
├── tests/
│   ├── helpers/              # app.ts, db-mock.ts
│   ├── unit/                 # crypto, injector
│   └── routes/               # crabs, secrets, execute
├── examples/                 # Empty — Phase 4
├── prisma/
│   └── schema.prisma         # crabs, pearls, tides, routes
├── coding_agent_logs/
│   ├── STATUS.md             # This file
│   └── sessions/             # 001–006
├── Dockerfile
├── docker-compose.yml
├── vitest.config.ts
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Key Decisions & Constraints

- **Runtime:** Node.js 22 + TypeScript (strict, NodeNext modules)
- **Framework:** Fastify v5
- **ORM:** Prisma 6.19.2 (pinned — 7.x has moderate vulns in dev tooling)
- **Encryption:** AES-256-GCM via Node `crypto` (no external crypto libs)
- **HTTP client:** `undici`
- **UI:** React 18 + Vite 7 + Tailwind 3
- **Networks:** `sand_bed` (internal, no internet) / `open_ocean` (bridge)
- **MASTER_PEARL:** 32-byte hex key — generate with `openssl rand -hex 32`
- **TypeScript must compile with zero errors** before any phase is considered done
- **All tests must pass** before committing
- **Home server (Mac mini) is P0 target** — Docker Compose + bash, no orchestrator

---

## Known Issues / Deferred

- Docker build not yet verified end-to-end (needs Docker daemon running — run `docker compose up` to verify)
- `pino-pretty` should move to `devDependencies` before production release
