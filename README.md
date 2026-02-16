# 🐚 HermitClaw

**A Hard Shell for Soft Agents.**

HermitClaw is a self-hosted, secure tool execution gateway and credential vault for AI agents. Agents are sandboxed with zero internet access — all tool calls are routed through HermitClaw, which validates the request, injects the right credentials, executes the call, and logs everything.

> **Status:** In Development — Phase 2 of 5 (Execute Gateway)

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
| **The Shell** | `hermit_shell` | Gateway service — the only component with internet access |
| **The Pearl Vault** | `hermit_db` | PostgreSQL database — all secrets encrypted at rest (AES-256-GCM) |
| **The Tide Pool** | `web/` | React dashboard — manage secrets, view audit logs, kill switch |
| **The Crab** | your agent | Sandboxed agent container — no internet, talks to Shell only |

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
│  │      HermitClaw Shell        │            │
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

### Tool Execution *(Phase 2 — coming soon)*

```bash
# Execute a tool call — Shell injects credentials and proxies the request
POST /v1/execute
Authorization: Bearer <agent-token>
{ "tool": "github_get_repo", "args": { "owner": "elfisher", "repo": "hermitClaw" } }
```

---

## Security

- **AES-256-GCM encryption** — all secrets encrypted at rest with a per-record IV and authentication tag
- **Master key never stored** — `MASTER_PEARL` lives only in the environment, never in the database
- **Tokens shown once** — agent bearer tokens are only returned at creation time
- **Network isolation** — agent containers are on an internal Docker network with no internet access
- **Audit log** — every tool call is logged to the `tides` table with request and sanitized response
- **Kill switch** — any agent can be revoked instantly via `PATCH /v1/crabs/:id/revoke`

---

## Development

```bash
# Run the server locally (hot reload)
npm run dev

# Type check
npx tsc --noEmit

# Database migrations (requires running Postgres)
npm run db:migrate

# Prisma Studio (DB browser)
npm run db:studio
```

---

## Roadmap

- [x] Phase 0 — Repo scaffold, Docker Compose, Fastify server
- [x] Phase 1 — Crypto core, Prisma schema, secrets + agent API
- [ ] Phase 2 — Execute gateway (credential injection, HTTP proxy, audit log)
- [ ] Phase 3 — Sandboxed Python example agent
- [ ] Phase 4 — Tide Pool UI (React dashboard)
- [ ] Phase 5 — Ingress routing (Signal / WhatsApp → agent)

---

## License

MIT
