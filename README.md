# 🐚 HermitClaw

**A Hard Shell for Soft Agents.**

HermitClaw is a self-hosted, secure tool execution gateway and credential vault for AI agents. Agents are sandboxed with zero internet access — all tool calls are routed through HermitClaw, which validates the request, injects the right credentials, executes the call, and logs everything.

> **Status:** Phases 0–8C complete. Login-gated Tide Pool UI, model proxy, CONNECT proxy with domain rules, agent UI reverse proxy, and clawbot provisioning scripts.

---

## The Problem

AI agents need API keys to do useful work. But giving an agent direct access to credentials is dangerous:
- Agents are vulnerable to prompt injection
- Credentials leak into logs, context windows, and model outputs
- There's no audit trail of what the agent actually did

## The Solution

HermitClaw sits between your agents and the internet. Agents never hold credentials — they ask HermitClaw to execute calls on their behalf.

```
Agent (sandboxed) → POST /v1/execute → HermitClaw → GitHub / Slack / any API
                                            ↓
                                     Injects credential
                                     Logs the request
                                     Returns the response
```

---

## Architecture

The system enforces a **zero-trust network topology** using Docker:

| Component | Name | Description |
|-----------|------|-------------|
| **The Hermit Shell** | `hermit_shell` | Gateway service — the only component with internet access |
| **The Pearl Vault** | `hermit_db` | PostgreSQL database — all secrets encrypted at rest (AES-256-GCM) |
| **The Tide Pool** | `web/` | React dashboard — manage secrets, view audit logs, kill switch |
| **The Crab** | your agent | Sandboxed agent container — no internet, talks to Hermit Shell only |

```
┌─────────────────────────────────────────────┐
│  sand_bed (internal — no internet)          │
│  ┌──────────────┐  ┌──────────────┐         │
│  │  Clawbot Dev │  │ Clawbot Prod │         │
│  └──────┬───────┘  └──────┬───────┘         │
│         │                 │                  │
└─────────┼─────────────────┼──────────────────┘
          │  POST /v1/execute│
┌─────────┼─────────────────┼──────────────────┐
│  open_ocean (bridge — internet access)       │
│         ▼                 ▼                  │
│  ┌──────────────────────────────┐            │
│  │      Hermit Shell            │            │
│  └──────────────┬───────────────┘            │
│                 │                            │
│  ┌──────────────▼───────────────┐            │
│  │       Pearl Vault (DB)       │            │
│  └──────────────────────────────┘            │
└─────────────────────────────────────────────┘
          │
          ▼ HTTPS
    GitHub, Slack, etc.
```

---

## Quickstart

### Prerequisites
- Docker + Docker Compose
- Node.js 22+

### 1. Clone and install

```bash
git clone https://github.com/elfisher/hermitClaw.git
cd hermitClaw
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Generate a master encryption key and add it to `.env`:

```bash
echo "MASTER_PEARL=$(openssl rand -hex 32)" >> .env
```

### 3. Start the stack

```bash
docker compose up -d
```

The Shell will be available at `http://localhost:3000`.

### 4. Verify

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"hermitclaw","version":"0.1.0"}
```

---

## API Overview

### Agents (Crabs)

```bash
# Register an agent — token is shown once
POST /v1/crabs
{ "name": "my-bot" }

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

### Tool Execution

```bash
# Execute a tool call — Shell injects credentials and proxies the request
POST /v1/execute
Authorization: Bearer <agent-token>
{
  "service": "github",
  "url": "https://api.github.com/repos/elfisher/hermitClaw",
  "method": "GET"
}
```

### Audit Log

```bash
# Paginated log of all tool calls
GET /v1/tides?page=1&limit=50&crabId=...
```

---

## Security Model

### What HermitClaw protects against

**Credential exposure**
Agents never hold API keys. Credentials are stored encrypted (AES-256-GCM, per-record IV) and injected only at the network boundary. They are never returned by the API, never appear in agent context windows or logs, and are not visible via `docker inspect`.

**Admin API Authentication**
Management routes (`/v1/crabs`, `/v1/secrets`, `/v1/tides`) are protected by an `x-admin-api-key` header, preventing unauthorized access to administrative functions and the Tide Pool UI.

**Lateral movement from a compromised agent**
Agent containers are on an internal Docker network (`sand_bed`) with no internet access. A compromised agent cannot make outbound calls except through HermitClaw. It cannot reach other services, exfiltrate data directly, or contact external command-and-control infrastructure.

**Tool Allowlisting**
Agents can be configured with an `allowedTools` list, restricting them to call only approved URLs and HTTP methods. This mitigates prompt injection leading to unintended actions by limiting agent capabilities.

**Runaway or rogue agents**
The kill switch (`PATCH /v1/crabs/:id/revoke`) immediately invalidates an agent's token. Combined with the audit log, you can see exactly what an agent did and cut it off before further damage.

**Rate Limiting**
The `/v1/execute` endpoint is rate-limited per-agent (60 requests/minute), preventing a single runaway agent from exhausting downstream API limits or performing a Denial-of-Service attack on the Hermit Shell.

**Request Timeout**
Outbound HTTP requests made by agents through HermitClaw now have a 30-second timeout, preventing slow or unresponsive upstream services from hanging the gateway indefinitely.

**Token Rotation / Expiration**
Agent tokens can be configured with an optional `expiresAt` timestamp, allowing for automatic token invalidation and enforcing regular token rotation policies.

**Credential leakage into the model**
Because agents route calls through HermitClaw rather than holding keys directly, credentials are never in the agent's prompt, response, memory, or tool arguments. A model that has been jailbroken cannot exfiltrate a key it never received.

**Audit coverage**
Every outbound tool call is logged: agent identity, target URL, HTTP method, status code, and a sanitized response. You have a complete record of what every agent did.

---

### What HermitClaw does NOT protect against

**Overly permissive credentials**
HermitClaw enforces *who* can use a credential and *that it goes through the gateway* — it does not enforce *what that credential is allowed to do*. If you store a Gmail credential that has delete access and give it to an agent, that agent can delete your email. If you store an AWS credential with `AdministratorAccess`, the agent can destroy your infrastructure. **Limit credential scope at the source.** Use read-only tokens wherever possible; use scoped tokens (e.g. a GitHub token with only `contents: read`) rather than personal access tokens with broad permissions.

**Prompt injection leading to unintended actions**
A malicious prompt in a document, email, or web page can instruct a capable agent to take actions the user didn't intend — deleting files, sending messages, making purchases — entirely within the permissions the credential allows. While `allowedTools` helps restrict *where* an agent can act, it cannot prevent an agent from choosing to use a permission it legitimately has within that scope.

**Actions within authorized scope**
If an agent is authorized to send Slack messages, it can be manipulated into sending embarrassing or harmful ones. If it can write files, it can overwrite important ones. Authorization boundary enforcement is a necessary layer on top of HermitClaw, not a substitute for it.

**Host-level compromise**
`MASTER_PEARL` (the vault encryption key) lives in `.env` on the host. If the host is compromised, an attacker can read the key and decrypt all stored credentials. This is an inherent limitation of self-hosted encryption — there is no hardware security module (HSM) or key management service (KMS) in the current design. For a home server with physical security, this is an acceptable tradeoff. For a shared or cloud environment, use a secrets manager (e.g. Vault) and do not commit `.env`.
For best practices on securing your Mac mini host, see [docs/mac-mini-deployment.md](docs/mac-mini-deployment.md).

**Network-internal threats**
HermitClaw isolates agents from the internet, not from each other or from other services on the same Docker network. Agents on `sand_bed` can reach HermitClaw and each other. If two agents share a workspace directory (Mode 3), they can read and modify each other's files.

**Summary**

| Threat | Protected? |
|--------|-----------|
| Credential in agent context window | Yes |
| Agent making direct internet calls | Yes |
| Audit trail of tool calls | Yes |
| Instant agent revocation | Yes |
| Admin API unauthorized access | Yes |
| Unapproved tool usage | Yes |
| Requests to private/loopback IPs (SSRF) | Yes |
| Runaway agent API flooding | Yes |
| Agent token expiry | Yes |
| Credential scope too broad | **No — limit at the source** |
| Prompt injection → unintended destructive action | **Partial — allowedTools in place, Phase 7 Risk Scanner planned** |
| Host OS / `.env` compromise | **No** |
| Agent-to-agent lateral movement (same network) | **No** |

---

## Connecting OpenClaw

[OpenClaw](https://openclaw.ai) is the primary integration target for HermitClaw.
OpenClaw is a personal AI assistant gateway that connects messaging channels (WhatsApp,
Telegram, Discord, iMessage, Slack) to an AI agent called Pi. Pi can run code, browse the
web, execute bash commands, and automate tasks — which makes a security layer like HermitClaw
essential.

> **Note:** Bare-metal macOS support was deprecated by OpenClaw in early 2026. The recommended
> path is a Linux server or Docker container. See
> [openclaw-ansible](https://github.com/openclaw/openclaw-ansible) for a hardened server setup.

### How it works

```
[WhatsApp / Telegram / Discord]
         │
         ▼
  [OpenClaw gateway]  ──── LLM calls ──▶  hermit_shell /v1/chat/completions
         │  (sand_bed, no internet)        (bearer token auth, fully logged)
         │
         └── outbound HTTP/S ──▶  hermit_shell CONNECT proxy
                                  (domain rules enforced, logged)
```

OpenClaw has no direct internet access. All LLM calls and outbound traffic flow through
HermitClaw, which logs everything and enforces your network policy.

### Quick setup

```bash
# 1. Start HermitClaw
docker compose up -d

# 2. Register OpenClaw as an agent
#    Writes .clawbots/openclaw.env with the bearer token + proxy settings
./scripts/clawbot-add.sh openclaw 18789

# 3. Copy the provider config to your OpenClaw config directory
cp examples/openclaw/openclaw.json ~/.openclaw/openclaw.json
#    Edit the models array to match what you have in HermitClaw → Providers

# 4. Start OpenClaw on the HermitClaw network
docker run -d \
  --name openclaw \
  --network hermitclaw_sand_bed \
  --env-file .clawbots/openclaw.env \
  -v ~/.openclaw:/home/node/.openclaw \
  openclaw:local

# 5. Access OpenClaw UI via Tide Pool
#    Tide Pool → Agents → openclaw → Open UI
#    Or: http://localhost:3000/agents/openclaw/
```

Two tokens are in play — don't confuse them:

| Token | Location | Purpose |
|---|---|---|
| `HERMITCLAW_TOKEN` | `.clawbots/openclaw.env` | HermitClaw agent auth. Used as `apiKey` when OpenClaw calls `/v1/chat/completions`. |
| OpenClaw gateway token | `~/.openclaw/.env` | OpenClaw's own Control UI token. Managed by OpenClaw, unrelated to HermitClaw. |

For the full integration guide including network rules, model access control, and production
server deployment, see [`examples/openclaw/README.md`](examples/openclaw/README.md).

---

## Deployment Considerations (TLS/Reverse Proxy)

For deployments beyond a single, isolated local machine, it is **highly recommended** to use a reverse proxy (such as Nginx or Caddy) to handle TLS (Transport Layer Security) for all incoming connections to the Hermit Shell.

The Hermit Shell operates over plain HTTP. While this is acceptable for communication internal to a physically secure host, exposing plain HTTP over a network (even a local home network) can allow attackers to snoop on or tamper with traffic, including sensitive API keys and other data.

A reverse proxy configured with a valid SSL/TLS certificate will encrypt all traffic between clients (e.g., your browser accessing the Tide Pool UI, or agents on other hosts communicating with the Hermit Shell) and the HermitClaw server, providing confidentiality and integrity.

---

## Local Development Setup

This guide runs the backend with hot-reload and the frontend with Vite's dev server — no Docker build step required after the initial database setup.

### Prerequisites

- **Node.js 22+** (`node --version`)
- **Docker Desktop** (for the database)
- **npm** (bundled with Node)

---

### Step 1 — Clone and install dependencies

```bash
git clone https://github.com/elfisher/hermitClaw.git
cd hermitClaw
npm install          # installs backend deps + runs prisma generate
cd web && npm install && cd ..
```

---

### Step 2 — Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in the two required values:

```bash
# Generate a 32-byte master encryption key (encrypts all stored secrets)
echo "MASTER_PEARL=$(openssl rand -hex 32)" >> .env

# Generate a secure admin API key (used to log in to Tide Pool)
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

---

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

---

### Step 4 — Sign in to Tide Pool

1. Open `http://localhost:5173` in your browser.
2. Enter your `ADMIN_API_KEY` from `.env`.
3. You're in.

---

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

---

### Step 6 — Make a test tool call

```bash
curl -s -X POST http://localhost:3000/v1/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <agent-token>" \
  -d '{
    "service": "none",
    "url": "https://httpbin.org/get",
    "method": "GET"
  }' | python3 -m json.tool
```

Check the **Audit Log** tab in Tide Pool to see the request logged.

---

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

### Full Docker stack (alternative)

If you want everything in Docker (no local Node required):

```bash
docker compose up --build -d
```

Then build and serve the frontend from the same container:

```bash
cd web && npm run build && cd ..
docker compose up --build -d
```

The full stack (including the pre-built UI) will be at `http://localhost:3000`.

---

## Using Ollama on Mac with HermitClaw

Ollama runs natively on Mac (Apple Silicon or Intel). HermitClaw's model proxy routes agent model calls to it — the agent never talks to Ollama directly.

### The networking problem

When the backend runs locally (`npm run dev`), `localhost:11434` works fine. But when running inside Docker, the container's `localhost` is the container itself — not your Mac. Docker Desktop solves this with the special hostname `host.docker.internal`, which always resolves to your Mac's IP from inside any container.

Ollama by default binds to `127.0.0.1:11434` (loopback only). Docker cannot reach a loopback address on the host, so you need to tell Ollama to also listen on the Docker bridge interface.

---

### Step 1 — Install Ollama

```bash
brew install ollama
```

Or download from [ollama.com](https://ollama.com).

---

### Step 2 — Bind Ollama to all interfaces

By default Ollama only listens on `127.0.0.1`. Set `OLLAMA_HOST` so Docker containers can reach it:

**Option A — for the current terminal session only:**
```bash
OLLAMA_HOST=0.0.0.0 ollama serve
```

**Option B — persistent (add to `~/.zshrc` or `~/.bashrc`):**
```bash
export OLLAMA_HOST=0.0.0.0
```
Then restart Ollama (quit the menu-bar app and relaunch, or restart the service).

> **Security note:** `0.0.0.0` exposes port 11434 to other devices on your local network. However, your agent containers are already protected by the architecture:
>
> - **Agent containers** live on `sand_bed` (`internal: true`) — Docker gives this network no default gateway, so agents have zero routing to `host.docker.internal` and cannot reach Ollama directly.
> - **`POST /v1/execute`** targeting Ollama's IP is blocked by HermitClaw's SSRF guard (private IP ranges).
> - **CONNECT proxy** tunnels to `host.docker.internal` can be blocked with a DENY rule in Network Rules.
> - **`POST /v1/chat/completions`** (the model proxy) is the one intentional path — agents can call Ollama through HermitClaw, which is logged in the Audit Log.
>
> The real exposure from `0.0.0.0` is **other devices on your LAN**, not your own agents. On a trusted home network this is generally acceptable. On a shared or public network, restrict port 11434 with a macOS `pf` firewall rule, or keep `OLLAMA_HOST=127.0.0.1` and run HermitClaw locally (not in Docker) where `localhost:11434` is sufficient.

---

### Step 3 — Pull a model

```bash
ollama pull llama3.2        # ~2GB, fast on Apple Silicon
# or
ollama pull mistral
ollama pull qwen2.5-coder   # good for coding agents
```

Verify it's running:

```bash
curl http://localhost:11434/api/tags
```

---

### Step 4 — Set `OLLAMA_BASE_URL` in `.env`

This is already in `.env.example`. Confirm it's in your `.env`:

```
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

> If running the backend locally (not in Docker), you can use `http://localhost:11434` instead — but `host.docker.internal` also works on Mac even outside Docker.

---

### Step 5 — Add Ollama as a provider in Tide Pool

1. Open Tide Pool → **Providers → Add Provider**
2. Fill in:

| Field | Value |
|-------|-------|
| Name | `ollama-local` (or any name) |
| Base URL | `http://host.docker.internal:11434` |
| Protocol | `OPENAI` (Ollama is OpenAI-compatible) |
| Scope | `GLOBAL` (all agents can use it) |
| API Key Secret | *(leave blank — Ollama needs no auth)* |

3. Click **Add Provider**.

---

### Step 6 — Test from an agent

Any agent with a bearer token can now call:

```bash
curl -s -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <agent-token>" \
  -d '{
    "model": "llama3.2",
    "messages": [{"role": "user", "content": "Say hello in one sentence."}]
  }' | python3 -m json.tool
```

HermitClaw routes the call to Ollama, logs it in the Audit Log, and returns the response. The agent never touches Ollama directly.

---

## Roadmap

### Completed

- [x] **Phase 0** — Repo scaffold, Docker Compose, Fastify server
- [x] **Phase 1** — Crypto core (AES-256-GCM), Prisma schema, secrets + agent API
- [x] **Phase 2** — Execute gateway: credential injection, HTTP proxy, SSRF guard, audit log
- [x] **Phase 3** — Tide Pool UI: React dashboard, agent management, secret CRUD, paginated audit log
- [x] **Security hardening** — Admin API key auth, SSRF guard (RFC-1918 + link-local + CGN), rate limiting, request timeout, token rotation, tool allowlisting
- [x] **Phase 8A** — Model proxy (`POST /v1/chat/completions`), provider CRUD, Providers tab in Tide Pool
- [x] **Phase 8B** — HTTP CONNECT proxy with priority-ordered domain rules, Network Rules + Settings tabs
- [x] **Phase 8C** — Session cookie login gate, agent UI reverse proxy (`/agents/:name/*`), clawbot provisioning scripts

### Recent improvements

- [x] **Dev UX** — Auto-login when `VITE_ADMIN_API_KEY` is set; sticky token dialog requires explicit acknowledgment before dismissal
- [x] **Audit log detail drawer** — Click any row to open a right-side panel with formatted request/response bodies
- [x] **Audit log retention** — Configurable in Settings (Forever / 7 / 30 / 90 / 365 days); pruned on a 24h interval
- [x] **Provider enable/disable** — Toggle providers on/off from the Providers tab without deleting them

### Planned

- [ ] **Phase 8D** — Inbound routing: messaging channels (WhatsApp, Telegram, Slack) → agent webhook dispatch
- [ ] **Phase 9** — Risk Scanner: inline classification of outbound requests and inbound responses; configurable block policies per agent
- [ ] **OpenClaw E2E smoke test** — Full end-to-end verification with a real OpenClaw container on `sand_bed`

---

## License

MIT
