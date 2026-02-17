# Session 008 — OpenClaw Integration Design

**Date:** 2026-02-17
**Agent:** Claude (claude-sonnet-4-5)
**Phase:** Design only — no code written
**Status:** Complete (design agreed, build ready to start)

---

## Goal

Design the integration between HermitClaw and OpenClaw — a popular open-source personal AI
assistant framework. HermitClaw becomes the **sole broker** for all of OpenClaw's traffic:
model API calls, outbound tool/channel calls, agent web UI access, and eventually inbound
webhook traffic.

---

## What Is OpenClaw

OpenClaw is a local-first personal AI agent platform. Key properties relevant to this integration:

- Gateway runs locally, connects to messaging channels (WhatsApp, Telegram, Slack, Discord, etc.)
- Supports **custom model providers** via `openclaw.json` with `api: "openai-completions"` type
- Custom `baseUrl` and `apiKey` fields support env var interpolation (`${HERMITCLAW_TOKEN}`)
- Uses standard OpenAI-compatible API format for model calls (`/v1/chat/completions`)
- Exposes a **web UI** (WebChat + Control UI) via its gateway — accessible via browser
- Uses **WebSocket** for real-time browser ↔ agent communication
- Built on Node.js ≥ 22; workspace at `~/.openclaw/workspace` (bind-mountable into Docker)

OpenClaw is the primary target agent for HermitClaw. The goal of this project is to secure
OpenClaw agents specifically.

---

## Core Architecture: HermitClaw as Total Broker

All traffic in and out of OpenClaw flows through HermitClaw. OpenClaw has no direct internet
access and no directly published ports. HermitClaw is the single egress/ingress/UI point.

```
[Internet / Messaging Channels]
          │
          ▼
[hermit_shell:3000]        ← sole public entry/exit point
          │  sand_bed (internal Docker network)
          ├──────────────► [hermit_db]     (Postgres vault, not reachable by openclaw)
          │  sand_bed
          └──────────────► [openclaw]      (no internet, no host, no published ports)
                               │
                               │  ALL outbound via HTTP CONNECT proxy
                               └──► hermit_shell ──► internet
```

OpenClaw env vars set by provisioning:
```
HTTP_PROXY=http://hermit_shell:3000
HTTPS_PROXY=http://hermit_shell:3000
SHELL_URL=http://hermit_shell:3000
AGENT_NAME=openclaw
```

---

## Traffic Types & How Each Is Handled

### 1. Model API Calls (LLM Inference)

**Mechanism:** Application-layer proxy — new `/v1/chat/completions` route on HermitClaw.

OpenClaw is configured to treat HermitClaw as its model provider:

```json
{
  "models": {
    "mode": "merge",
    "providers": {
      "hermitclaw": {
        "baseUrl": "http://hermit_shell:3000/v1",
        "apiKey": "${HERMITCLAW_TOKEN}",
        "api": "openai-completions",
        "models": [
          { "id": "ollama/llama3.2", "name": "Llama 3.2 (local)" }
        ]
      }
    }
  }
}
```

HermitClaw flow:
1. Authenticates crab token from `Authorization: Bearer <token>`
2. Resolves which `ModelProvider` to use (based on model ID prefix or configured default)
3. Checks `ModelProviderAccess` — is this crab allowed to use this provider?
4. Optionally injects credential from vault (for cloud providers with `pearlService` set)
5. Proxies to configured backend (Ollama, Anthropic, OpenAI, etc.)
6. Streams response back unmodified (chunked transfer, SSE passthrough)
7. Logs request + response summary to tides

**Completely transparent to OpenClaw** — it believes it is talking to a normal OpenAI-compatible API.

**Streaming requirement:** The proxy MUST handle `stream: true` responses via chunked
passthrough. Never buffer the full response before returning.

### 2. Outbound Channel/Tool Calls (HTTP CONNECT Proxy)

**Mechanism:** Standard HTTP CONNECT tunnel. Node.js respects `HTTP_PROXY` / `HTTPS_PROXY`
natively. Zero OpenClaw code changes required.

HermitClaw evaluates `ConnectRule` records before allowing or denying each tunnel:
- Rules evaluated in `priority` order (lower = higher priority)
- Rules can be global (all agents) or per-crab
- When no rule matches: behaviour governed by `SystemSetting: connect_proxy_default`
- Default value for `connect_proxy_default`: `ALLOW` (permissive for dev, flip to `DENY` for prod)

HermitClaw capabilities at the CONNECT proxy layer:
- ✓ Log: destination host, port, timestamp, crab ID → tides
- ✓ Allow/block by domain or wildcard (`*.telegram.org`)
- ✓ Per-agent rules (override global rules for specific crabs)
- ✗ Content: HTTPS is opaque (encrypted end-to-end)

Full content visibility is available only for model calls (application-layer). For channel
API calls, you see host + timing. SSL inspection (custom CA MITM) is possible as a future
enhancement but is invasive and out of scope.

### 3. Agent Web UI Access (Reverse Proxy)

**Mechanism:** HermitClaw reverse-proxies each agent's web UI. OpenClaw stays on `sand_bed`
with no published ports — all browser access goes through HermitClaw.

```
Browser → GET localhost:3000/agents/openclaw/*
       → hermit_shell (on sand_bed) → openclaw:18789/*

Browser → WS localhost:3000/agents/openclaw/ws
       → hermit_shell → openclaw:18789 (WebSocket upgrade passthrough)
```

Implementation: `@fastify/http-proxy` with path prefix rewriting + WebSocket upgrade support.

**Authentication:** Browser requests cannot send custom headers for navigation. Instead,
HermitClaw uses a **short-lived signed session cookie** set at login. The Tide Pool login
flow (admin key entry) sets this cookie; it gates the agent UI proxy routes and solves the
"login screen" deferred item from STATUS.md.

Cookie design:
- Signed with `ADMIN_API_KEY` (HMAC-SHA256)
- Short expiry: `maxAge: 8h`  (configurable via SystemSetting)
- `HttpOnly`, `SameSite: Strict`, `Secure` in production
- Stored as `hermit_session` on the HermitClaw origin

**Agent UI button in Tide Pool:** When `Crab.uiPort` is set, the Agents tab shows an
"Open UI" button linking to `/agents/<name>/` in a new tab. Users get the full OpenClaw
WebChat + Control UI experience, gated behind the HermitClaw session cookie.

```
Tide Pool — Agents tab
┌─────────────────────────────────────────────┐
│  openclaw    ● Active    [Open UI]  [Revoke] │
│  archive-bot ● Active               [Revoke] │
└─────────────────────────────────────────────┘
                 ↓ click
        localhost:3000/agents/openclaw/
        (full OpenClaw UI, no isolation broken)
```

### 4. Inbound Webhook Traffic (channels → OpenClaw) — Deferred

**Mechanism:** HermitClaw ingress routing (Phase 8D). Messaging services call HermitClaw's
public webhook endpoint. HermitClaw routes internally to OpenClaw on `sand_bed`. OpenClaw
never needs a public port.

**Status:** Deferred. Covered by existing Phase 5 (Ingress Routing) design.

---

## Data Model Changes

### ModelProvider — Model backends (Ollama, OpenAI, Anthropic, etc.)

```prisma
model ModelProvider {
  id           String    @id @default(cuid())
  name         String    @unique   // e.g. "ollama-local", "openai", "anthropic"
  baseUrl      String             // e.g. "http://host.docker.internal:11434"
  protocol     Protocol           // OPENAI | ANTHROPIC
  pearlService String?            // null = no auth; set = look up pearl for cred injection
  scope        ProviderScope      // GLOBAL | RESTRICTED
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  access ModelProviderAccess[]

  @@map("model_providers")
}

// Join table — only used when scope = RESTRICTED
model ModelProviderAccess {
  providerId String
  crabId     String

  @@id([providerId, crabId])
  @@map("model_provider_access")
}

enum Protocol {
  OPENAI      // OpenAI-compatible (/v1/chat/completions) — covers Ollama + OpenAI
  ANTHROPIC   // Anthropic native (/v1/messages)
}

enum ProviderScope {
  GLOBAL      // Any authenticated crab can use this provider
  RESTRICTED  // Only crabs listed in ModelProviderAccess can use this provider
}
```

**Credential injection by provider type:**

| Provider | `pearlService` | Auth injected |
|---------|---------------|---------------|
| Ollama (local) | `null` | None |
| OpenAI | `"openai"` | `Authorization: Bearer <key>` |
| Anthropic | `"anthropic"` | `x-api-key: <key>` + `anthropic-version: 2023-06-01` |

### ConnectRule — HTTP CONNECT proxy policy

```prisma
model ConnectRule {
  id        String     @id @default(cuid())
  domain    String     // exact ("telegram.org") or wildcard ("*.slack.com")
  action    RuleAction // ALLOW | DENY
  crabId    String?    // null = global; set = applies to that crab only
  priority  Int        // lower number = evaluated first
  note      String?    // human-readable description
  createdAt DateTime   @default(now())

  @@map("connect_rules")
}

enum RuleAction {
  ALLOW
  DENY
}
```

### SystemSetting — Key-value store for global config

```prisma
model SystemSetting {
  key       String   @id   // e.g. "connect_proxy_default", "session_cookie_ttl_hours"
  value     String         // stored as string, parsed by application
  updatedAt DateTime @updatedAt

  @@map("system_settings")
}
```

**Initial settings seeded at startup (if not present):**

| Key | Default | Description |
|-----|---------|-------------|
| `connect_proxy_default` | `ALLOW` | Fallback when no ConnectRule matches |
| `session_cookie_ttl_hours` | `8` | Admin session cookie lifetime |

### Crab — Add uiPort field

```prisma
// Existing Crab model gains:
uiPort Int?   // null = no web UI; e.g. 18789 for OpenClaw
```

---

## Network Topology

```yaml
networks:
  sand_bed:
    internal: true      # no internet (existing — unchanged)
  open_ocean:
    driver: bridge      # internet access (existing — hermit_shell egress only)

# hermit_shell: sand_bed + open_ocean (unchanged)
# hermit_db:    open_ocean only (NOT sand_bed — openclaw cannot reach DB directly)
# openclaw:     sand_bed only (no internet, all traffic via HTTP_PROXY)
```

`hermit_db` stays off `sand_bed`. Even if OpenClaw escapes its container process, it has
no network path to the database. HermitClaw mediates all data access.

---

## OpenClaw Container Security Profile

```yaml
openclaw:
  image: ghcr.io/openclaw/openclaw:latest
  container_name: openclaw
  networks: [sand_bed]
  read_only: true
  user: "1000:1000"
  cap_drop: [ALL]
  security_opt:
    - no-new-privileges:true
  tmpfs:
    - /tmp:size=256m,noexec
  mem_limit: 2g
  cpus: 1.0
  pids_limit: 128
  environment:
    - HTTP_PROXY=http://hermit_shell:3000
    - HTTPS_PROXY=http://hermit_shell:3000
    - SHELL_URL=http://hermit_shell:3000
    - AGENT_NAME=openclaw
    - HERMITCLAW_TOKEN_FILE=/run/hermit/token
  volumes:
    - openclaw_state:/state
    - ./workspaces/openclaw:/workspace
    - openclaw_token:/run/hermit:ro
  depends_on:
    - hermit_shell
```

---

## Ollama Placement

Runs directly on Mac host to use Apple Silicon unified memory. Not in Docker.

| Context | Ollama URL | Notes |
|---------|-----------|-------|
| Dev (backend on host) | `http://localhost:11434` | Both on host, direct |
| Docker (hermit_shell in container) | `http://host.docker.internal:11434` | Docker → Mac host |

Configured via `OLLAMA_BASE_URL` in `.env`. The ModelProvider `baseUrl` defaults to this
env var but can be overridden per-provider in the DB.

SSRF guard exemption: model provider URLs are **admin-configured**, not agent-controlled.
The agent sends `POST /v1/chat/completions` with messages; HermitClaw resolves the backend
URL from its own config. There is no agent-controlled SSRF surface on the model proxy route.

---

## Bootstrap Sequence (No Race Condition)

```
1. docker compose up -d hermit_db hermit_shell
2. scripts/clawbot-add.sh openclaw --ui-port 18789
   → registers crab in HermitClaw
   → writes token to ./workspaces/openclaw/.hermit_token
   → writes openclaw.json with hermitclaw provider config
3. docker compose up -d openclaw
   → container reads token from /run/hermit/token
   → all model calls → hermit_shell → Ollama
   → all outbound traffic → hermit_shell CONNECT proxy → internet
4. Admin opens Tide Pool → logs in (sets session cookie)
   → clicks "Open UI" on openclaw
   → hermit_shell reverse-proxies to openclaw:18789
```

Steps 1-2 complete before step 3. No race condition.

---

## Build Plan

### Phase 8A — Model Proxy

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `ModelProvider`, `ModelProviderAccess`, `Protocol`, `ProviderScope` |
| `src/routes/model.ts` | New: `POST /v1/chat/completions` (OpenAI-compat, streaming passthrough) |
| `src/lib/ssrf.ts` | Add provider-bypass flag; admin-configured providers skip IP check |
| `src/lib/auth.ts` | `requireCrab` unchanged; model route uses same middleware |
| `web/src/pages/ProvidersPage.tsx` | New: Providers tab — add/edit/delete providers, manage access |
| `web/src/api/client.ts` | Add provider CRUD + access management calls |
| `web/src/api/types.ts` | Add `ModelProvider`, `ModelProviderAccess` types |
| `web/src/App.tsx` | Add Providers tab to sidebar |
| `.env.example` | Add `OLLAMA_BASE_URL` |

### Phase 8B — HTTP CONNECT Proxy + Domain Rules

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `ConnectRule`, `RuleAction`, `SystemSetting` |
| `src/routes/connect.ts` | New: HTTP CONNECT tunnel handler + rule evaluation |
| `src/lib/connect-rules.ts` | Rule evaluation logic (priority, wildcard matching, crab-scope) |
| `src/index.ts` | Register CONNECT handler (must be at server level, not route plugin) |
| `web/src/pages/NetworkPage.tsx` | New: Network Rules tab — manage ConnectRules + default |
| `web/src/pages/SettingsPage.tsx` | New: Settings tab — SystemSettings (cookie TTL, etc.) |
| `web/src/App.tsx` | Add Network + Settings tabs |

### Phase 8C — Agent UI Proxy + Cookie Auth + OpenClaw Provisioning

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `Crab.uiPort` field |
| `src/routes/agent-ui.ts` | New: `/agents/:name/*` reverse proxy + WS upgrade passthrough |
| `src/lib/session.ts` | New: signed cookie issue/verify (HMAC-SHA256 with ADMIN_API_KEY) |
| `src/routes/auth.ts` | New: `POST /v1/auth/login` (validates admin key, sets cookie) |
| `web/src/App.tsx` | Add login gate — if no session cookie, show login form |
| `web/src/pages/LoginPage.tsx` | New: Admin key entry form |
| `web/src/pages/AgentsPage.tsx` | Add "Open UI" button when `uiPort` is set |
| `docker-compose.yml` | Add `openclaw` service definition |
| `scripts/clawbot-add.sh` | New: register + provision clawbot (accepts `--ui-port` flag) |
| `scripts/clawbot-remove.sh` | New: revoke + stop + optionally destroy data |
| `scripts/clawbots-sync.sh` | New: idempotent convergence to `clawbots.yml` |
| `clawbots.yml.example` | New: user-facing config template |
| `examples/openclaw/openclaw.json` | New: OpenClaw provider config template |

### Phase 8D — Inbound Routing (Deferred)

Messaging channels → HermitClaw public webhook → internal routing to openclaw on `sand_bed`.
Covered by Phase 5 design. Build after 8A-8C are stable.

---

## Decisions Made

- **OpenClaw in Docker on `sand_bed`** — no direct internet access, no published ports
- **HTTP_PROXY for full outbound coverage** — zero OpenClaw code changes, Node.js native
- **Application-layer proxy for model calls** — full content logging, streaming passthrough
- **CONNECT proxy for channel/tool calls** — host+port auditing, content opaque (HTTPS)
- **SSL inspection out of scope** — invasive, not needed for current threat model
- **Agent web UI via HermitClaw reverse proxy** — sand_bed access, no isolation compromise
- **WebSocket passthrough** — real-time OpenClaw chat works through the proxy
- **Session cookie for browser auth** — signed HMAC, short-lived, HttpOnly; solves deferred login screen TODO
- **ConnectRule table** — domain rules configurable in Tide Pool, not hardcoded/env-var
- **connect_proxy_default = ALLOW initially** — flip to DENY for production hardening
- **ModelProvider.scope = GLOBAL | RESTRICTED** — restrict cloud providers to specific agents
- **SystemSetting table** — global config (proxy default, cookie TTL) stored in DB, editable via UI
- **Ollama on Mac host** — uses Apple Silicon unified memory, reached via `host.docker.internal`
- **Start with OpenAI-compat route only** — covers Ollama + OpenAI; Anthropic native added later
- **`pearlService: null` = no auth** — Ollama needs no credential; future-proof for cloud providers
- **Inbound routing deferred** — Phase 8D, build after 8A-8C stable

---

## Resolved Questions

| Question | Decision |
|----------|----------|
| CONNECT proxy allowlist vs denylist? | Configurable via `ConnectRule` table + `connect_proxy_default` SystemSetting |
| ModelProvider global vs crab-scoped? | Configurable per provider: `scope = GLOBAL` or `RESTRICTED` with access join table |
| How to expose agent web UI? | HermitClaw reverse proxy at `/agents/:name/*` with WS passthrough |
| How to auth browser → agent UI? | Signed session cookie set at Tide Pool login |
