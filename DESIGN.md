# HermitClaw — System Design

> **Tagline:** A Hard Shell for Soft Agents.
> **Primary target:** OpenClaw agents on a self-hosted Mac mini.
> **License:** MIT

---

## 1. Executive Summary

**HermitClaw** is a self-hosted, secure gateway and credential vault for AI agents. It is the
**sole broker** for everything an agent does: model API calls, outbound tool/API calls, web UI
access, and inbound messaging webhooks. Agents are fully sandboxed — no direct internet access,
no directly published ports, no credential exposure.

The primary integration target is **OpenClaw**, a popular open-source personal AI assistant
framework. HermitClaw secures OpenClaw by sitting between it and the world.

---

## 2. Mental Model

| Component | Metaphor | Role |
|-----------|---------|------|
| **The Hermit Shell** (HermitClaw gateway) | The shell | The only thing with access to the outside world. Validates, brokers, logs everything. |
| **The Pearl Vault** (PostgreSQL) | The pearl | Encrypted credentials, only accessible by the Hermit Shell. |
| **The Crab** (Agent container) | The crab | Lives inside the shell. Cannot act without it. |
| **The Tide Pool** (Web UI) | The tide pool | Human control plane for managing agents, secrets, providers, and policy. |

---

## 3. High-Level Architecture

```
[Browser]           [Internet / Messaging Channels]
    │                           │
    │ localhost:3000             │
    ▼                           ▼
┌─────────────────────────────────────────┐
│           hermit_shell:3000             │  ← sole public entry/exit
│                                         │
│  • Tide Pool UI (React SPA)             │
│  • REST API (crabs, secrets, tides)     │
│  • Model proxy (/v1/chat/completions)   │
│  • HTTP CONNECT proxy                   │
│  • Agent UI reverse proxy               │
│  • Ingress webhook routing (Phase 8D)   │
└──────────┬──────────────────────────────┘
           │ sand_bed (internal, no internet)
    ┌──────┴──────┐
    │             │
    ▼             ▼
[hermit_db]  [openclaw]     [other-clawbot]  ...
 Postgres     sand_bed         sand_bed
 (no direct   no internet      no internet
 agent        HTTP_PROXY=      HTTP_PROXY=
 access)      hermit_shell     hermit_shell
```

---

## 4. Traffic Types

### OpenClaw tokens — important distinction

OpenClaw operates with two separate tokens:

| Token | Lives in | Purpose |
|---|---|---|
| **HermitClaw crab token** (`HERMITCLAW_TOKEN`) | `.clawbots/openclaw.env` | Authenticates OpenClaw to HermitClaw for model calls and is used as the `apiKey` in `openclaw.json`. Written by `clawbot-add.sh`. |
| **OpenClaw gateway token** | `~/.openclaw/.env` | Authenticates users to OpenClaw's own Control UI. Managed entirely by OpenClaw. Unrelated to HermitClaw. |

These must not be confused. `HTTP_PROXY` and `HTTPS_PROXY` (also in `.clawbots/openclaw.env`)
cause all of OpenClaw's outbound traffic to route through HermitClaw's CONNECT proxy — Node.js
honours these natively, requiring zero changes to OpenClaw's code.

### A. Model API Calls (Application-Layer Proxy)

Agent calls `POST /v1/chat/completions` with its crab token. HermitClaw:
1. Authenticates the crab token
2. Checks `ModelProviderAccess` (scope: GLOBAL or RESTRICTED)
3. Resolves the configured `ModelProvider` (Ollama, OpenAI, Anthropic, etc.)
4. Optionally injects API key from the vault (for cloud providers)
5. Streams the response back unmodified
6. Logs request + response to tides

**Full content visibility.** Completely transparent to the agent — it believes it is talking
to a standard OpenAI-compatible API.

### B. Outbound Tool/Channel Calls (HTTP CONNECT Proxy)

All outbound HTTP/HTTPS from agent containers is routed through HermitClaw via
`HTTP_PROXY=http://hermit_shell:3000`. Node.js honours this natively; zero agent code changes.

HermitClaw evaluates `ConnectRule` records (priority-ordered, wildcard domain matching, global
or per-crab) before allowing or denying each tunnel. Default behaviour is governed by the
`connect_proxy_default` SystemSetting (`ALLOW` for dev, `DENY` for production hardening).

**Host:port visibility only** for HTTPS tunnels (content is encrypted end-to-end).

### C. Agent Web UI (Reverse Proxy + WebSocket)

HermitClaw reverse-proxies each agent's web UI at `/agents/:name/*`, including WebSocket
upgrade passthrough. Agents stay on `sand_bed` with no published ports.

Browser auth uses a **short-lived signed session cookie** (HMAC-SHA256 with `ADMIN_API_KEY`,
8h TTL, HttpOnly) set at Tide Pool login. The same cookie gates agent UI proxy routes.

### D. Inbound Webhooks (Deferred — Phase 8D)

Messaging services (WhatsApp, Telegram, Slack) call HermitClaw's public webhook endpoint.
HermitClaw routes internally to the correct agent on `sand_bed`. Agents never need public ports.

---

## 5. Network Topology

```yaml
networks:
  sand_bed:
    internal: true    # No internet. Agents + Shell only.
  open_ocean:
    driver: bridge    # Internet access. Shell egress only.

# hermit_shell → sand_bed + open_ocean
# hermit_db    → open_ocean only   (agents cannot reach DB directly)
# openclaw     → sand_bed only     (HTTP_PROXY routes all outbound via Shell)
```

---

## 6. Data Model

```
Crab                 — registered agent (token, allowedTools, expiresAt, uiPort?)
Pearl                — AES-256-GCM encrypted credential, owned by a Crab
Tide                 — audit log entry (all traffic: tool calls, model calls, CONNECT tunnels)
Route                — ingress routing rules (Phase 8D)
ModelProvider        — LLM backend config (baseUrl, protocol, pearlService?, scope)
ModelProviderAccess  — join: which Crabs can use a RESTRICTED ModelProvider
ConnectRule          — domain allow/deny policy for CONNECT proxy
SystemSetting        — global key-value config (connect_proxy_default, session TTL, etc.)
```

### Encryption

All pearls encrypted at rest with **AES-256-GCM** using a per-record random IV. The master
key (`MASTER_PEARL`) is a 32-byte hex value stored only in `.env` — never in the DB.

---

## 7. Component Specifications

### The Hermit Shell (`src/`)

- **Runtime:** Node.js 22 + TypeScript (strict, NodeNext modules)
- **Framework:** Fastify v5
- **Routes:**
  - `GET  /health` — liveness check
  - `POST /v1/crabs` — register agent
  - `GET  /v1/crabs` — list agents
  - `PATCH /v1/crabs/:id` — update agent fields (e.g. `uiPort`)
  - `PATCH /v1/crabs/:id/revoke` — kill switch
  - `POST /v1/secrets` — store encrypted credential
  - `GET  /v1/secrets` — list credentials (keys only)
  - `DELETE /v1/secrets/:id` — delete credential
  - `POST /v1/execute` — tool call gateway (SSRF-guarded, rate-limited, audited)
  - `GET  /v1/tides` — paginated audit log
  - `POST /v1/chat/completions` — model proxy (OpenAI-compat, streaming)
  - `CONNECT *` — HTTP CONNECT tunnel proxy
  - `GET|POST|... /agents/:name/*` — agent web UI reverse proxy (all methods + WS passthrough)
  - `POST /v1/auth/login` — validates admin key, sets signed session cookie
  - `POST /v1/auth/logout` — clears session cookie
  - `GET  /v1/auth/me` — session validity check (used by SPA on load)
  - `GET  /v1/providers` — list model providers
  - `POST /v1/providers` — add model provider
  - `PATCH /v1/providers/:id` — update model provider
  - `DELETE /v1/providers/:id` — delete model provider
  - `GET  /v1/connect-rules` — list domain rules
  - `POST /v1/connect-rules` — add domain rule
  - `DELETE /v1/connect-rules/:id` — delete domain rule
  - `GET  /v1/settings` — get system settings
  - `PUT  /v1/settings/:key` — update system setting
  - `GET  /` — serves Tide Pool React SPA (web/dist)

### The Pearl Vault (`hermit_db`)

- PostgreSQL 16, Docker container on `open_ocean`
- Not accessible from `sand_bed` — agents have no network path to the DB

### The Tide Pool (`web/`)

- React 18 + Vite 7 + Material-UI 7 + Tailwind 3
- Pages: Login, Agents, Secrets, Audit Log, Providers, Network Rules, Settings
- Served statically by the Hermit Shell at `GET /`

### Ollama (Host)

- Runs directly on Mac host to use Apple Silicon unified memory
- Reached from Docker via `http://host.docker.internal:11434`
- Configured via `OLLAMA_BASE_URL` in `.env`

---

## 8. Security Model

### What HermitClaw protects against

| Threat | Mitigation |
|--------|-----------|
| Agent holds API keys | Keys stored in vault, never sent to agent |
| Prompt injection → credential exfil | Agent can't request arbitrary URLs on `/v1/execute` (SSRF guard) |
| Prompt injection → LLM abuse | ModelProvider scope limits which providers each agent can use |
| Prompt injection → outbound exfil | CONNECT proxy + domain rules; full audit log of all connections |
| Runaway agent | Per-agent rate limiting (60 req/min), 30s timeout, kill switch |
| Token forgery | Tokens are cuid2 values stored in DB; revocation is instant |
| Token theft (long-lived) | Optional `expiresAt` on crabs; rotation supported |
| Unauthorized admin access | `ADMIN_API_KEY` required on all management routes; session cookie for UI |
| Agent ↔ DB lateral movement | `hermit_db` not on `sand_bed`; no network path from agent to DB |
| Agent ↔ agent lateral movement | Each agent on isolated `sand_bed`; no direct agent-to-agent routes |
| Port scanning host | No `host.docker.internal` route from `sand_bed` |

### Known limitations / accepted tradeoffs

- HTTPS CONNECT tunnel content is opaque (end-to-end encrypted) — host:port only
- `MASTER_PEARL` in `.env` — host compromise = vault compromise (inherent in self-hosted model)
- Mode 3 workspace bots can read each other's subdirectories — intentional, documented
- SSL inspection (full HTTPS content visibility) is out of scope

### OpenClaw device authentication

OpenClaw's gateway has a device pairing layer on top of password/token auth. On Docker-on-Mac, NAT makes the browser appear as an "external" device to the container, triggering pairing requirements.

**Current approach:** `allowInsecureAuth: true` in `openclaw.json`

This bypasses device pairing while keeping password authentication. Defense layers:

| Layer | Status | What it protects |
|-------|--------|------------------|
| Tide Pool session | ✅ Enforced | Unauthorized access to `/agents/openclaw/` |
| OpenClaw password | ✅ Enforced | Unauthorized WebSocket connections |
| Network isolation | ✅ Enforced | OpenClaw on `sand_bed` (no internet) |
| Device pairing | ❌ Bypassed | Credential replay from different device |

**Tradeoff:**
- **Lost:** Defense against credential replay if both Tide Pool session + OpenClaw password are compromised
- **Gained:** Reliable connection through Docker NAT + HermitClaw proxy without manual device approval

**When this is acceptable:**
- Local development
- Single-user or trusted team deployments
- Docker-on-Mac (device pairing breaks due to NAT)

**When stricter security is needed:**
- Multi-tenant server deployments
- See `docs/openclaw-device-auth.md` for automated device approval approach

---

## 9. Deployment

### Development

```bash
# One command: starts DB, syncs schema, hot-reloads backend + frontend
npm run dev

# Run tests
npm test
```

`npm run dev` (via `scripts/dev.sh`) checks `.env`, starts `hermit_db`, waits for healthy,
runs `prisma db push`, then starts backend (`tsx watch`) and frontend (`Vite`) concurrently.

### Production — Docker (single host)

```bash
docker compose up -d                              # hermit_shell + hermit_db
./scripts/clawbot-add.sh openclaw 18789           # register OpenClaw, write .clawbots/openclaw.env
cp examples/openclaw/openclaw.json ~/.openclaw/openclaw.json  # configure OpenClaw provider

docker run -d \
  --name openclaw \
  --network hermitclaw_sand_bed \
  --env-file .clawbots/openclaw.env \
  -v ~/.openclaw:/home/node/.openclaw \
  openclaw:local
```

Access Tide Pool at `http://localhost:3000`. OpenClaw UI at `/agents/openclaw/`.

Use a reverse proxy (nginx/Caddy) with TLS for any network-accessible deployment.

### Production — Linux Server

For server-side deployment and hardening, follow the
[OpenClaw installation docs](https://docs.openclaw.ai/install/docker). Deploy HermitClaw
on the same host so both services share the `sand_bed` Docker network. Never expose port
3000 directly to the internet — use a reverse proxy with TLS or a VPN (e.g. Tailscale).

---

## 10. Repository Structure

```
hermitClaw/
├── src/
│   ├── index.ts                  # Fastify entry point + static serve + SPA fallback
│   ├── routes/
│   │   ├── crabs.ts              # Agent registration + kill switch
│   │   ├── secrets.ts            # Encrypted credential CRUD
│   │   ├── execute.ts            # POST /v1/execute — tool call gateway
│   │   ├── tides.ts              # GET /v1/tides — audit log
│   │   ├── model.ts              # POST /v1/chat/completions — model proxy (Phase 8A)
│   │   ├── connect.ts            # HTTP CONNECT tunnel proxy (Phase 8B)
│   │   ├── agent-ui.ts           # /agents/:name/* reverse proxy (Phase 8C)
│   │   └── auth.ts               # POST /v1/auth/login (Phase 8C)
│   └── lib/
│       ├── auth.ts               # requireCrab / requireAdmin prehandlers
│       ├── crypto.ts             # AES-256-GCM encrypt/decrypt
│       ├── db.ts                 # Prisma client singleton
│       ├── ssrf.ts               # SSRF guard (RFC-1918, IPv6, DNS rebinding)
│       ├── injector.ts           # Credential injection strategies
│       ├── connect-rules.ts      # CONNECT proxy rule evaluation (Phase 8B)
│       └── session.ts            # Signed session cookie (Phase 8C)
├── web/
│   └── src/
│       ├── App.tsx               # Main layout + login gate
│       ├── api/                  # Typed fetch client + types
│       └── pages/
│           ├── LoginPage.tsx     # Admin key entry (Phase 8C)
│           ├── AgentsPage.tsx    # Register/revoke agents
│           ├── SecretsPage.tsx   # Credential CRUD
│           ├── AuditLogPage.tsx  # Paginated tides
│           ├── ProvidersPage.tsx # Model provider management (Phase 8A)
│           ├── NetworkPage.tsx   # Domain rules (Phase 8B)
│           └── SettingsPage.tsx  # System settings (Phase 8B)
├── prisma/
│   └── schema.prisma             # Full schema (crabs, pearls, tides, routes,
│                                 #   model_providers, connect_rules, system_settings)
├── scripts/
│   ├── dev.sh                    # Start full dev environment
│   ├── clawbot-add.sh            # Register + provision a clawbot (Phase 8C)
│   ├── clawbot-remove.sh         # Revoke + teardown (Phase 8C)
│   └── clawbots-sync.sh          # Idempotent convergence to clawbots.yml (Phase 8C)
├── examples/
│   └── openclaw/
│       └── openclaw.json         # Provider config template (Phase 8C)
├── tests/                        # Vitest — 90 tests passing
├── docker-compose.yml
├── Dockerfile
├── clawbots.yml.example          # User-facing clawbot config (Phase 8C)
├── .env.example
├── DESIGN.md                     # This file
├── PLAN.md                       # Phase-by-phase implementation checklist
└── coding_agent_logs/            # Audit trail of every build session
    ├── STATUS.md                 # Single source of truth for resuming work
    └── sessions/                 # 001–008 session logs
