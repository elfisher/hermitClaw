# HermitClaw — Agent Status File

> **Read this first.** This file is the single source of truth for any agent resuming work on this project.

---

## Current State

**Active Phase:** Phase 8B — HTTP CONNECT Proxy + Domain Rules
**Last Session:** `009-phase-8a-model-proxy`
**Build status:** `tsc` clean (backend + frontend). 90/90 tests passing. Backend running locally. Phase 8A complete and smoke tested.

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
- [x] **Security Hardening (P0/P1/P2)** — complete (partial, see backlog below)
- [x] **UI Overhaul (MUI)** — complete (`007-security-hardening.md`)
- [x] **Phase 8A — Model Proxy** — complete (`009-phase-8a-model-proxy`)
- [ ] **Phase 8B — HTTP CONNECT Proxy** — design complete, not yet built
- [ ] **Phase 8C — OpenClaw Provisioning** — design complete, not yet built
- [ ] **Phase 8D — Inbound Routing** — deferred (was Phase 5)
- [ ] **Clawbot Provisioning Scripts** — design complete (`006-clawbot-provisioning-design.md`), not yet built
- [ ] **Phase 4 — Python Example Agent** — superseded by OpenClaw integration
- [ ] **Phase 6 — Activity Monitor** — not started (design needed)
- [ ] **Phase 7 — Risk Scanner** — not started (design needed)

---

## What To Do Next

**Build Phase 8B — HTTP CONNECT Proxy + Domain Rules.**
See PLAN.md Phase 8B checklist.

**Suggested build order:** 8B (CONNECT proxy) → 8C (provisioning) → 8D (inbound)

---

## OpenClaw Integration Design

> Full design in `008-openclaw-integration-design.md`. Summary below.

### Goal

HermitClaw becomes the **sole broker** for all OpenClaw traffic — model calls, outbound
channel/tool calls, and eventually inbound webhooks. OpenClaw runs in Docker with no direct
internet access. Everything is auditable and blockable at HermitClaw.

### Architecture

```
[Internet]
    │
    ▼
[hermit_shell:3000]   ← sole public entry/exit
    │  sand_bed
    ├──► [hermit_db]      (Postgres, not reachable by openclaw)
    │  sand_bed
    └──► [openclaw]       (no internet, HTTP_PROXY=hermit_shell:3000)
```

### Traffic Routing

| Traffic type | Mechanism | Content visible |
|---|---|---|
| LLM inference | App-layer proxy: `POST /v1/chat/completions` | Full request + response |
| Outbound channel calls | HTTP CONNECT tunnel via `HTTP_PROXY` | Host + port only (HTTPS opaque) |
| Agent web UI | Reverse proxy `/agents/:name/*` + WS passthrough | N/A (UI, not data) |
| Inbound webhooks | HermitClaw ingress routing (Phase 8D, deferred) | Full |

### New DB Tables (all phases)

| Table | Purpose |
|-------|---------|
| `ModelProvider` | LLM backends (Ollama, OpenAI, Anthropic); `scope: GLOBAL\|RESTRICTED` |
| `ModelProviderAccess` | Join table — which crabs can use RESTRICTED providers |
| `ConnectRule` | Domain allow/deny rules for CONNECT proxy; priority-ordered, per-crab or global |
| `SystemSetting` | Key-value global config (`connect_proxy_default`, `session_cookie_ttl_hours`) |
| `Crab.uiPort` | Optional field — when set, Tide Pool shows "Open UI" button |

### Agent Web UI Access

HermitClaw reverse-proxies each agent's web UI at `/agents/:name/*`. Includes WebSocket
upgrade passthrough so OpenClaw's real-time chat works. OpenClaw stays on `sand_bed` with
no published ports — full isolation preserved.

Browser auth uses a **signed session cookie** (HMAC-SHA256, 8h TTL, HttpOnly) set at Tide
Pool login. Same cookie gates agent UI proxy routes. Resolves the deferred login screen TODO.

### CONNECT Proxy Policy

Configurable via `ConnectRule` table in Tide Pool UI. Rules are priority-ordered, support
wildcards (`*.telegram.org`), and can be scoped to a specific crab or global. When no rule
matches, `SystemSetting: connect_proxy_default` applies (`ALLOW` for dev, `DENY` for prod).

### Provider Scope

`ModelProvider.scope = GLOBAL` (any crab) or `RESTRICTED` (explicit access grant per crab).
Use GLOBAL for local Ollama, RESTRICTED for expensive cloud providers (OpenAI, Anthropic).

### Ollama Placement

Runs directly on Mac host (Apple Silicon unified memory). Reached from Docker via
`http://host.docker.internal:11434`. Configured via `OLLAMA_BASE_URL` in `.env`.

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

- [x] **Default DB password** — `docker-compose.yml` ships `securepass`. Most users won't
  change it. **Fix:** require `DB_PASSWORD` env var, no hardcoded default.

- [x] **No TLS** — Shell port is plain HTTP. Fine for isolated Mac mini, problem on shared
  networks. **Fix:** document reverse proxy requirement (nginx/Caddy) in README.

### P2 — Before sharing with others

- [ ] **Shell injection in provisioning scripts** — `<name>` param must be validated to
  `[a-z0-9-]` only before use in shell commands or YAML generation. (SKIPPED)

- [x] **No rate limiting on `/v1/execute`** — runaway agent can exhaust downstream API
  rate limits or DoS the Shell. **Fix:** per-crab rate limit (e.g. 60 req/min).

- [x] **No request timeout on outbound calls** — slow upstream hangs connection indefinitely.
  **Fix:** 30s timeout on undici requests.

- [x] **No token rotation** — tokens are permanent until manually revoked. No expiry.
  **Fix:** optional `expiresAt` field on crabs table, checked in `requireCrab`.

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
- **Tide Pool UI has no real login screen** — admin API key is currently injected at Vite
  build time via `VITE_ADMIN_API_KEY` in `web/.env.local`. This is acceptable for local
  dev but means the key is baked into the JS bundle. Before sharing the UI with others or
  running it on a network, implement a proper login screen: prompt for the admin key on
  first load, store it in `sessionStorage` (cleared on tab close), and read from there in
  `apiFetch`. The `client.ts` change is already structured for this — swap
  `import.meta.env.VITE_ADMIN_API_KEY` for a `getAdminKey()` helper that reads
  `sessionStorage`.
- **No `prisma/migrations/` directory** — schema was applied with `prisma db push` (dev
  shortcut). Before production or multi-environment use, create a proper migration baseline:
  `npx prisma migrate dev --name init`. This generates versioned SQL files that can be
  replayed reliably on a fresh DB.
