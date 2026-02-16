# 🐚 HermitClaw

**A Hard Shell for Soft Agents.**

HermitClaw is a self-hosted, secure tool execution gateway and credential vault for AI agents. Agents are sandboxed with zero internet access — all tool calls are routed through HermitClaw, which validates the request, injects the right credentials, executes the call, and logs everything.

> **Status:** In Development — Phases 0–3 complete. Clawbot provisioning system next.

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
The `/v1/execute` endpoint is rate-limited per-agent (60 requests/minute), preventing a single runaway agent from exhausting downstream API limits or performing a Denial-of-Service attack on the Shell.

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

## Deployment Considerations (TLS/Reverse Proxy)

For deployments beyond a single, isolated local machine, it is **highly recommended** to use a reverse proxy (such as Nginx or Caddy) to handle TLS (Transport Layer Security) for all incoming connections to the HermitClaw Shell.

The HermitClaw Shell operates over plain HTTP. While this is acceptable for communication internal to a physically secure host, exposing plain HTTP over a network (even a local home network) can allow attackers to snoop on or tamper with traffic, including sensitive API keys and other data.

A reverse proxy configured with a valid SSL/TLS certificate will encrypt all traffic between clients (e.g., your browser accessing the Tide Pool UI, or agents on other hosts communicating with the Shell) and the HermitClaw server, providing confidentiality and integrity.

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

### Completed

- [x] **Phase 0** — Repo scaffold, Docker Compose, Fastify server
- [x] **Phase 1** — Crypto core (AES-256-GCM), Prisma schema, secrets + agent API
- [x] **Phase 2** — Execute gateway: credential injection, HTTP proxy, SSRF guard, audit log
- [x] **Phase 3** — Tide Pool UI: React dashboard, agent management, secret CRUD, paginated audit log
- [x] **Security hardening (P0)** — Admin API key authentication on all management routes; tool allowlisting (`allowedTools` per agent)
- [x] **Security hardening (P1)** — Complete SSRF guard (RFC-1918 ranges, IPv6, DNS rebinding); remove default DB password
- [x] **Security hardening (P2)** — Rate limiting on `/v1/execute`; request timeout on outbound calls; token rotation

### In Progress

- [ ] **Clawbot provisioning** — `clawbots.yml` config, three workspace modes, `scripts/clawbot-add.sh` / `clawbot-remove.sh` / `clawbots-sync.sh`, auto-generated `docker-compose.clawbots.yml`

### Planned

- [x] **Security hardening (P1)** — Document TLS/reverse proxy requirement
- [ ] **Security hardening (P2)** — Shell injection in provisioning scripts (`<name>` param validation)
- [ ] **Phase 4** — Python example agent: minimal clawbot that uses HermitClaw to call GitHub and Slack
- [ ] **Phase 5** — Ingress routing: Signal / WhatsApp → agent webhook dispatch (post-MVP)
- [ ] **Phase 6 — Activity Monitor** — Real-time agent activity feed in the Tide Pool UI. Live stream of in-flight and recent requests per agent, timeline view, anomaly highlighting (unusual target URLs, spike in request rate, error bursts), per-agent activity summary cards.
- [ ] **Phase 7 — Risk Scanner** — Configurable inline scanning at the gateway. Classify outbound requests and inbound responses for risk before they execute or are returned to the agent. Block high-risk actions (e.g. DELETE requests to data services, bulk write operations) and high-risk responses (e.g. responses containing PII, credential-shaped strings, or anomalous payloads). Policy defined per agent or globally; violations logged and optionally alerted.

---

## License

MIT
