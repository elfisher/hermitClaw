# 🐚 HermitClaw

**A Hard Shell for Soft Agents.**

HermitClaw is a secure proxy and credential vault for **[OpenClaw](https://openclaw.ai)** personal AI assistants. It sits between OpenClaw and the internet, enforcing network policy, injecting credentials, and logging all LLM calls and outbound traffic.

> **Primary target:** OpenClaw agents on a self-hosted Mac mini or home server.
> **Also works with:** Any agent framework that can call HTTP APIs.
> **Status:** Phases 0–8C complete. E2E OpenClaw integration verified.

---

## Why HermitClaw?

OpenClaw connects messaging channels (WhatsApp, Telegram, Discord, iMessage) to an AI agent called Pi. Pi can run code, browse the web, execute bash commands, and automate tasks — which makes a security layer like HermitClaw essential.

**The problem:**
- Agents are vulnerable to prompt injection
- Giving OpenClaw your Anthropic/OpenAI API key directly means it could be exfiltrated
- Cloud model calls and outbound channel/web requests are invisible — no audit trail
- No way to enforce network policy (e.g., "allow Telegram API, deny everything else")

**The solution:**

HermitClaw becomes the **sole broker** for everything OpenClaw does:

```
[WhatsApp / Telegram / Discord]
         │
         ▼
  [OpenClaw gateway]  ──── LLM calls ───▶  hermit_shell /v1/chat/completions
         │  (sand_bed, no internet)         /api/chat (native Ollama format)
         │                                  (bearer token auth, fully logged)
         └── outbound HTTP/S ──▶  hermit_shell CONNECT proxy
                                  (domain rules enforced, host:port logged)
```

OpenClaw runs in a sandboxed Docker network with zero internet access. All LLM calls and outbound traffic flow through HermitClaw, which logs everything and enforces your network policy.

---

## Quickstart (OpenClaw Integration)

### Prerequisites
- Docker + Docker Compose
- Node.js 22+
- OpenClaw installed (see [openclaw.ai](https://openclaw.ai))

### 1. Clone and install HermitClaw

```bash
git clone https://github.com/elfisher/hermitClaw.git
cd hermitClaw
npm install
```

### 2. Configure environment

```bash
cp .env.example .env

# Generate a 32-byte master encryption key (encrypts stored secrets)
echo "MASTER_PEARL=$(openssl rand -hex 32)" >> .env

# Generate a secure admin API key (used to log in to Tide Pool)
echo "ADMIN_API_KEY=$(openssl rand -hex 32)" >> .env
```

### 3. Start HermitClaw

```bash
docker compose up -d
```

HermitClaw will be available at `http://localhost:3000`.

Verify:
```bash
curl http://localhost:3000/health
# {"status":"ok","service":"hermitclaw","version":"0.1.0"}
```

### 4. Register OpenClaw as an agent

```bash
# Writes .clawbots/openclaw.env with bearer token + HTTP_PROXY settings
./scripts/clawbot-add.sh openclaw 18789
```

This creates `.clawbots/openclaw.env`:
```bash
HERMITCLAW_TOKEN=<long-bearer-token>
SHELL_URL=http://hermit_shell:3000
AGENT_NAME=openclaw
HTTP_PROXY=http://hermit_shell:3000
HTTPS_PROXY=http://hermit_shell:3000
NO_PROXY=localhost,127.0.0.1,hermit_shell
```

### 5. Configure OpenClaw to use HermitClaw

Copy the example configuration to your OpenClaw config directory:

```bash
cp examples/openclaw/openclaw.json ~/.openclaw/openclaw.json
```

Edit `~/.openclaw/openclaw.json` and update the `models` array to match what you have configured in HermitClaw (see step 7).

Key config sections:
```json
{
  "models": {
    "mode": "merge",
    "providers": {
      "hermitclaw": {
        "baseUrl": "http://hermit_shell:3000",
        "apiKey": "${HERMITCLAW_TOKEN}",
        "api": "ollama",  // or "openai-completions" for OpenAI format
        "models": [
          {
            "id": "llama3.1",
            "name": "Llama 3.1 (via HermitClaw)",
            "contextWindow": 128000,
            "maxTokens": 32000
          }
        ]
      }
    }
  },
  "gateway": {
    "bind": "lan",  // Required for HermitClaw proxy access
    "auth": {
      "mode": "password",
      "password": "your-strong-password-here"
    },
    "controlUi": {
      // Bypasses device pairing (required for Docker-on-Mac NAT)
      // Password auth + Tide Pool session + network isolation still enforced
      "allowInsecureAuth": true
    }
  }
}
```

### 6. Start OpenClaw on the HermitClaw network

```bash
docker run -d \
  --name openclaw \
  --network hermitclaw_sand_bed \
  --env-file .clawbots/openclaw.env \
  -v ~/.openclaw:/home/node/.openclaw \
  openclaw:local
```

> **Note:** Replace `openclaw:local` with your OpenClaw image tag. See [OpenClaw installation docs](https://docs.openclaw.ai/install/docker).

### 7. Configure an LLM provider in Tide Pool

Open `http://localhost:3000` and log in with your `ADMIN_API_KEY`.

Go to **Providers → Add Provider**:

**For local Ollama (recommended for testing):**

| Field | Value |
|-------|-------|
| Name | `ollama-local` |
| Base URL | `http://host.docker.internal:11434` |
| Protocol | `OPENAI` |
| Scope | `GLOBAL` (all agents can use it) |
| API Key Secret | *(leave blank)* |

**For Anthropic Claude:**

| Field | Value |
|-------|-------|
| Name | `anthropic-claude` |
| Base URL | `https://api.anthropic.com` |
| Protocol | `ANTHROPIC` |
| Scope | `RESTRICTED` (explicit per-agent access grant) |
| API Key Secret | `anthropic` (we'll create this pearl next) |

Then go to **Secrets → Add Secret**:
- Agent: `openclaw`
- Service: `anthropic`
- Plaintext: `sk-ant-...` (your Anthropic API key)

Then back to **Providers**, click on `anthropic-claude` → **Grant Access** → select `openclaw`.

### 8. Access OpenClaw UI via Tide Pool

In Tide Pool, go to **Agents → openclaw → Open UI**.

Or navigate directly to: `http://localhost:3000/agents/openclaw/`

Log in with the password you set in `openclaw.json`.

### 9. Send a message and verify audit trail

Send a message in OpenClaw that requires an LLM call (e.g., "Hello, how are you?").

Go back to Tide Pool → **Audit Log** to see:
- **EGRESS** entry to the LLM provider (request + response bodies logged)
- **EGRESS** entries for any outbound channel/web requests (host:port logged for HTTPS tunnels)

**You're done!** OpenClaw now routes all traffic through HermitClaw with full audit logging and network policy enforcement.

---

## Understanding the Two Tokens

OpenClaw operates with two separate tokens — don't confuse them:

| Token | Location | Purpose |
|---|---|---|
| **`HERMITCLAW_TOKEN`** | `.clawbots/openclaw.env` | HermitClaw agent authentication. Used as `apiKey` in `openclaw.json` when OpenClaw calls `/v1/chat/completions` or `/api/chat`. |
| **OpenClaw gateway token** | `~/.openclaw/.env` | Authenticates users to OpenClaw's own Control UI. Managed entirely by OpenClaw. Unrelated to HermitClaw. |

---

## Architecture

HermitClaw enforces a **zero-trust network topology** using Docker:

```
┌─────────────────────────────────────────────┐
│  sand_bed (internal — no internet)          │
│  ┌──────────────────────────┐               │
│  │  OpenClaw (or any agent) │               │
│  └──────────┬───────────────┘               │
│             │                                │
└─────────────┼────────────────────────────────┘
              │  LLM calls + CONNECT proxy
┌─────────────┼────────────────────────────────┐
│  open_ocean (bridge — internet access)      │
│             ▼                                │
│  ┌──────────────────────────────┐           │
│  │      Hermit Shell:3000       │           │
│  │  • Model proxy               │           │
│  │  • CONNECT proxy             │           │
│  │  • Agent UI reverse proxy    │           │
│  │  • Tide Pool UI              │           │
│  └──────────────┬───────────────┘           │
│                 │                            │
│  ┌──────────────▼───────────────┐           │
│  │     Pearl Vault (Postgres)   │           │
│  └──────────────────────────────┘           │
└─────────────────────────────────────────────┘
          │
          ▼ HTTPS
    Anthropic, OpenAI, Telegram, etc.
```

### Components

| Component | Name | Description |
|-----------|------|-------------|
| **The Hermit Shell** | `hermit_shell` | Gateway service — the only component with internet access |
| **The Pearl Vault** | `hermit_db` | PostgreSQL database — all secrets encrypted at rest (AES-256-GCM) |
| **The Tide Pool** | `web/` | React dashboard — manage providers, secrets, network rules, view audit logs |
| **The Crab** | your agent | Sandboxed agent container (e.g., OpenClaw) — no internet, all traffic via Hermit Shell |

### Traffic Types

**A. Model API Calls** (application-layer proxy)
- OpenClaw calls `POST /v1/chat/completions` (OpenAI format) or `POST /api/chat` (Ollama format)
- HermitClaw authenticates the bearer token, resolves the provider, optionally injects API key from vault
- **Full request + response visibility** (logged to audit trail)
- Completely transparent to the agent

**B. Outbound Channel/Web Calls** (CONNECT proxy)
- All HTTP/HTTPS from OpenClaw routes through `HTTP_PROXY=http://hermit_shell:3000`
- Node.js honors this natively — zero code changes required
- HermitClaw evaluates domain rules (priority-ordered, wildcard matching) before allowing/denying tunnels
- **Host:port visibility only** for HTTPS (content is end-to-end encrypted)

**C. Agent Web UI** (reverse proxy + WebSocket)
- HermitClaw proxies OpenClaw's Control UI at `/agents/openclaw/*`
- Includes WebSocket upgrade passthrough for real-time chat
- OpenClaw stays on `sand_bed` with no published ports — full isolation preserved

---

## Network Policy (CONNECT Proxy Rules)

Configure domain allow/deny rules in **Tide Pool → Network Rules**.

Rules are priority-ordered and support wildcards:

```
Priority 1:  *.telegram.org    ALLOW   (global)
Priority 2:  *.anthropic.com   ALLOW   (for agent: openclaw)
Priority 3:  *                 DENY    (global catch-all)
```

Default behavior when no rule matches is controlled by **Settings → CONNECT Proxy Default** (`ALLOW` for dev, `DENY` for production).

---

## Using Ollama on Mac with HermitClaw

Ollama runs natively on Mac (Apple Silicon or Intel). HermitClaw's model proxy routes agent model calls to it — the agent never talks to Ollama directly.

### Step 1 — Install Ollama

```bash
brew install ollama
```

Or download from [ollama.com](https://ollama.com).

### Step 2 — Bind Ollama to all interfaces

By default Ollama only listens on `127.0.0.1`. Set `OLLAMA_HOST` so Docker containers can reach it:

```bash
export OLLAMA_HOST=0.0.0.0
```

Then restart Ollama (quit the menu-bar app and relaunch, or restart the service).

> **Security note:** `0.0.0.0` exposes port 11434 to other devices on your local network. However, your agent containers cannot reach it directly — they're on `sand_bed` (internal network, no default gateway). The only path to Ollama is through HermitClaw's model proxy, which is logged. The real exposure is other devices on your LAN. On a trusted home network this is acceptable.

### Step 3 — Pull a model

```bash
ollama pull llama3.1      # 8B, fast on Apple Silicon
ollama pull qwen2.5-coder # good for coding agents
```

Verify:
```bash
curl http://localhost:11434/api/tags
```

### Step 4 — Set `OLLAMA_BASE_URL` in `.env`

Confirm this is in your `.env`:

```
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

> `host.docker.internal` is a special Docker hostname that resolves to your Mac's IP from inside containers.

### Step 5 — Add Ollama as a provider in Tide Pool

See step 7 in the OpenClaw quickstart above.

### Step 6 — Pre-load the model (recommended)

Ollama unloads models from memory after inactivity. Pre-load with `keep_alive`:

```bash
curl -s http://localhost:11434/api/chat -d '{
  "model": "llama3.1",
  "messages": [{"role": "user", "content": "hi"}],
  "stream": false,
  "keep_alive": "24h"
}'
```

This keeps the model in memory for 24 hours, avoiding 80+ second cold starts.

---

## Performance Note (OpenClaw + Local LLMs)

OpenClaw injects ~17KB of system prompt + bootstrap files (tooling docs, workspace context) on **every message turn**. This significantly increases LLM processing time:

- **Simple message ("hi"):** 6-9 seconds with llama3.1:8b
- **OpenClaw message (full prompt):** 90-120+ seconds, often timeout

**Workarounds:**
1. **Use cloud provider** (Anthropic Claude, OpenAI GPT-4) — much faster
2. **Use faster local model** (qwen2.5-coder may be quicker)
3. **Accept slow performance** for local-only testing
4. **Increase timeout** — HermitClaw model proxy timeout is 300s by default

This is a limitation of OpenClaw's prompt size, not HermitClaw. Future OpenClaw versions may expose configuration to reduce prompt injection.

---

## Local Development Setup

This guide runs the backend with hot-reload and the frontend with Vite's dev server — no Docker build step required after the initial database setup.

### Prerequisites

- **Node.js 22+** (`node --version`)
- **Docker Desktop** (for the database)
- **npm** (bundled with Node)

### Step 1 — Clone and install dependencies

```bash
git clone https://github.com/elfisher/hermitClaw.git
cd hermitClaw
npm install          # installs backend deps + runs prisma generate
cd web && npm install && cd ..
```

### Step 2 — Create your `.env` file

```bash
cp .env.example .env

# Generate a 32-byte master encryption key
echo "MASTER_PEARL=$(openssl rand -hex 32)" >> .env

# Generate a secure admin API key
echo "ADMIN_API_KEY=$(openssl rand -hex 32)" >> .env
```

Your `.env` should now look like this:

```
MASTER_PEARL=<64-char hex>
ADMIN_API_KEY=<64-char hex>
DB_PASSWORD=securepass
DATABASE_URL=postgresql://hermit:securepass@localhost:5432/hermitclaw
PORT=3000
NODE_ENV=development
```

> **Note:** `DB_PASSWORD` can stay as `securepass` for local dev — the database port is not exposed to the network.

### Step 3 — Start the dev environment

```bash
npm run dev
```

This single command:
- Starts the PostgreSQL container (`hermit_db` only)
- Waits for it to be healthy
- Runs `prisma db push` to sync the schema
- Starts the backend (`tsx watch`, hot reload) and the Vite frontend concurrently

Output will be labeled `[backend]` (cyan) and `[frontend]` (magenta). Ctrl-C stops everything.

| URL | What |
|-----|------|
| `http://localhost:3000` | Hermit Shell API |
| `http://localhost:5173` | Tide Pool UI (Vite, proxies `/v1/*` to backend) |

### Step 4 — Sign in to Tide Pool

1. Open `http://localhost:5173` in your browser.
2. Enter your `ADMIN_API_KEY` from `.env`.
3. You're in.

### Step 5 — Register your first agent

In Tide Pool, go to **Agents → Register Agent** and give it a name (e.g. `test-bot`).

Or via curl:

```bash
curl -s -X POST http://localhost:3000/v1/crabs \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $(grep ADMIN_API_KEY .env | cut -d= -f2)" \
  -d '{"name": "test-bot"}' | python3 -m json.tool
```

Copy the `token` — it's only shown once.

### Useful dev commands

```bash
# Type check (backend)
npx tsc --noEmit

# Type check (frontend)
cd web && npx tsc --noEmit

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Open Prisma Studio (DB browser) at http://localhost:5555
npm run db:studio

# Stop the database
docker compose down
```

---

## Security Model

### What HermitClaw protects against

✅ **Credential exposure** — Agents never hold API keys; stored encrypted (AES-256-GCM); injected only at network boundary

✅ **Lateral movement from compromised agent** — Agents on internal network (`sand_bed`) with no internet access

✅ **Tool allowlisting** — Restrict agents to approved URLs/methods (mitigates prompt injection)

✅ **Runaway agents** — Kill switch revokes token instantly; rate limiting (60 req/min per agent); 30s request timeout

✅ **Audit coverage** — Every outbound call logged (agent, target, method, status, request/response bodies for LLM calls)

✅ **Admin API protection** — Management routes require `x-admin-api-key` header

✅ **SSRF guard** — Blocks private IP ranges (RFC-1918, link-local, CGNAT, IMDS)

✅ **Token expiration** — Optional `expiresAt` timestamp for automatic token invalidation

### What HermitClaw does NOT protect against

❌ **Overly permissive credentials** — Limit credential scope at the source (use read-only tokens, scoped GitHub PATs, etc.)

❌ **Prompt injection → unintended actions** — A malicious prompt can instruct an agent to act within authorized scope

❌ **Host-level compromise** — `MASTER_PEARL` lives in `.env`; host compromise = vault compromise

❌ **Network-internal threats** — Agents on `sand_bed` can reach each other (Mode 3 workspace sharing is intentional)

### Summary

| Threat | Protected? |
|--------|-----------|
| Credential in agent context window | Yes |
| Agent making direct internet calls | Yes |
| Audit trail of LLM + tool calls | Yes |
| Instant agent revocation | Yes |
| Admin API unauthorized access | Yes |
| Unapproved tool usage | Yes |
| SSRF (requests to private IPs) | Yes |
| Runaway agent API flooding | Yes |
| Agent token expiry | Yes |
| Credential scope too broad | **No — limit at the source** |
| Prompt injection → destructive action within scope | **Partial — allowedTools helps** |
| Host OS / `.env` compromise | **No** |
| Agent-to-agent lateral movement (same network) | **No** |

---

## Using HermitClaw with Other Agents

HermitClaw is **architected to be agent-agnostic** — while it's optimized for OpenClaw, any agent that can make HTTP requests can use it.

### Generic agent integration

**1. Register the agent:**
```bash
curl -X POST http://localhost:3000/v1/crabs \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY" \
  -d '{"name": "my-custom-agent"}'
```

Save the `token`.

**2. Call the model proxy:**
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -d '{
    "model": "llama3.1",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }'
```

Or use native Ollama format:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -d '{
    "model": "llama3.1",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }'
```

**3. Call the tool execution proxy:**
```bash
curl -X POST http://localhost:3000/v1/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -d '{
    "service": "github",
    "url": "https://api.github.com/repos/elfisher/hermitClaw",
    "method": "GET"
  }'
```

HermitClaw will inject the `github` credential from the vault (if stored) and return the response.

**4. Use CONNECT proxy for outbound calls:**

Set `HTTP_PROXY` and `HTTPS_PROXY` environment variables to `http://hermit_shell:3000`. Most HTTP clients (Node.js, Python `requests`, curl) honor these natively.

For full API documentation, see the [API Reference](#api-overview) section.

---

## API Overview

### Agents (Crabs)

```bash
# Register an agent — token is shown once
POST /v1/crabs
{ "name": "my-bot", "uiPort": 18789 }  # uiPort optional

# List agents (tokens never returned)
GET /v1/crabs

# Kill switch — immediately revoke an agent's access
PATCH /v1/crabs/:id/revoke
```

### Secrets (Pearls)

```bash
# Store an encrypted credential for an agent
POST /v1/secrets
{ "crabId": "...", "service": "github", "plaintext": "ghp_..." }

# List secrets (encrypted values never returned)
GET /v1/secrets?crabId=...

# Remove a secret
DELETE /v1/secrets/:id
```

### Model Proxy

```bash
# OpenAI-compatible endpoint
POST /v1/chat/completions
Authorization: Bearer <agent-token>
{ "model": "llama3.1", "messages": [...], "stream": false }

# Ollama native endpoint
POST /api/chat
Authorization: Bearer <agent-token>
{ "model": "llama3.1", "messages": [...], "stream": false }
```

### Tool Execution

```bash
# Execute a tool call — Shell injects credentials and proxies the request
POST /v1/execute
Authorization: Bearer <agent-token>
{
  "service": "github",
  "url": "https://api.github.com/repos/elfisher/hermitClaw",
  "method": "GET",
  "body": {...},     # optional
  "headers": {...}   # optional
}
```

### Audit Log

```bash
# Paginated log of all traffic (LLM calls, tool calls, CONNECT tunnels)
GET /v1/tides?page=1&limit=50&crabId=...&direction=EGRESS
```

---

## Deployment Considerations (TLS/Reverse Proxy)

For deployments beyond a single, isolated local machine, it is **highly recommended** to use a reverse proxy (such as Nginx or Caddy) to handle TLS (Transport Layer Security) for all incoming connections to the Hermit Shell.

The Hermit Shell operates over plain HTTP. While this is acceptable for communication internal to a physically secure host, exposing plain HTTP over a network (even a local home network) can allow attackers to snoop on or tamper with traffic, including sensitive API keys and other data.

A reverse proxy configured with a valid SSL/TLS certificate will encrypt all traffic between clients (e.g., your browser accessing the Tide Pool UI, or agents on other hosts communicating with the Hermit Shell) and the HermitClaw server, providing confidentiality and integrity.

---

## Roadmap

### Completed

- [x] **Phase 0** — Repo scaffold, Docker Compose, Fastify server
- [x] **Phase 1** — Crypto core (AES-256-GCM), Prisma schema, secrets + agent API
- [x] **Phase 2** — Execute gateway: credential injection, HTTP proxy, SSRF guard, audit log
- [x] **Phase 3** — Tide Pool UI: React dashboard, agent management, secret CRUD, paginated audit log
- [x] **Security hardening** — Admin API key auth, SSRF guard, rate limiting, request timeout, token rotation, tool allowlisting
- [x] **Phase 8A** — Model proxy (OpenAI + Ollama formats), provider CRUD, Providers tab in Tide Pool
- [x] **Phase 8B** — HTTP CONNECT proxy with domain rules, Network Rules + Settings tabs
- [x] **Phase 8C** — Session cookie login gate, agent UI reverse proxy (`/agents/:name/*`), clawbot provisioning scripts
- [x] **OpenClaw E2E integration** — Full integration verified with native Ollama API support

### Recent improvements

- [x] **Ollama native API** — `/api/chat` endpoint for native Ollama format (alongside `/v1/chat/completions`)
- [x] **Audit log request body logging** — Full request/response bodies now logged for LLM calls
- [x] **Provider-agnostic architecture** — Support multiple LLM API formats (not forced into OpenAI format)
- [x] **OpenClaw device auth documentation** — Comprehensive guide for Docker-on-Mac NAT workarounds
- [x] **Dev UX** — Auto-login when `VITE_ADMIN_API_KEY` is set; sticky token dialog
- [x] **Audit log detail drawer** — Click any row for formatted request/response view
- [x] **Audit log retention** — Configurable (Forever / 7 / 30 / 90 / 365 days); 24h interval pruning
- [x] **Provider enable/disable** — Toggle providers without deleting

### Planned

- [ ] **Anthropic API support** — Add `/v1/messages` endpoint for native Anthropic format
- [ ] **Phase 8D** — Inbound routing: messaging channels (WhatsApp, Telegram, Slack) → agent webhook dispatch
- [ ] **Phase 9** — Risk Scanner: inline classification of outbound requests and inbound responses; configurable block policies per agent

---

## Full Documentation

- **[DESIGN.md](DESIGN.md)** — System architecture, data model, traffic types
- **[examples/openclaw/README.md](examples/openclaw/README.md)** — Full OpenClaw integration guide
- **[docs/openclaw-device-auth.md](docs/openclaw-device-auth.md)** — Device authentication strategies
- **[coding_agent_logs/sessions/](coding_agent_logs/sessions/)** — Development session logs
- **[coding_agent_logs/TROUBLESHOOTING_PLAYBOOK.md](coding_agent_logs/TROUBLESHOOTING_PLAYBOOK.md)** — Process improvements, anti-patterns, golden rules

---

## License

MIT
