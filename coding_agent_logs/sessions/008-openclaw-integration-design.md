# Session 008 — OpenClaw Integration Design

**Date:** 2026-02-17
**Agent:** Claude (claude-sonnet-4-5)
**Phase:** Design only — no code written
**Status:** Complete (design agreed, build ready to start)

---

## Goal

Design the integration between HermitClaw and OpenClaw — a popular open-source personal AI
assistant framework. HermitClaw becomes the **sole broker** for all of OpenClaw's traffic:
model API calls, outbound tool/channel calls, and eventually inbound webhook traffic.

---

## What Is OpenClaw

OpenClaw is a local-first personal AI agent platform. Key properties relevant to this integration:

- Gateway runs locally, connects to messaging channels (WhatsApp, Telegram, Slack, Discord, etc.)
- Supports **custom model providers** via `openclaw.json` with `api: "openai-completions"` type
- Custom `baseUrl` and `apiKey` fields support env var interpolation (`${HERMITCLAW_TOKEN}`)
- Uses standard OpenAI-compatible API format for model calls (`/v1/chat/completions`)
- Built on Node.js ≥ 22
- Workspace lives at `~/.openclaw/workspace` (bind-mountable into Docker)

OpenClaw is the primary target agent for HermitClaw. The goal of HermitClaw is to secure
OpenClaw agents specifically.

---

## Core Architecture Decision: HermitClaw as Total Broker

All traffic in and out of OpenClaw flows through HermitClaw. OpenClaw has no direct internet
access. HermitClaw is the single egress/ingress point.

```
[Internet / Messaging Channels]
          │
          ▼
[hermit_shell:3000]        ← sole public entry/exit point
          │  sand_bed (internal Docker network)
          ├──────────────► [hermit_db]     (Postgres vault)
          │  sand_bed
          └──────────────► [openclaw]      (no internet, no host access)
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

### 1. Model API Calls (LLM inference)

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
2. Resolves which `ModelProvider` to use
3. Optionally injects credential from vault (for cloud providers)
4. Proxies to configured backend (Ollama, Anthropic, OpenAI, etc.)
5. Streams response back to OpenClaw unmodified
6. Logs request + response to tides

**Completely transparent to OpenClaw** — it believes it's talking to a normal OpenAI-compatible API.

### 2. Outbound Channel/Tool Calls (HTTP CONNECT proxy)

**Mechanism:** Standard HTTP CONNECT tunnel proxy. Node.js respects `HTTP_PROXY` / `HTTPS_PROXY`
environment variables natively. Zero OpenClaw code changes required.

HermitClaw capabilities at the CONNECT proxy layer:
- ✓ Log: destination host, port, timestamp, crab ID → tides
- ✓ Block: by domain/host (configurable allowlist or denylist)
- ✓ Audit: which external services OpenClaw connects to and when
- ✗ Content: HTTPS traffic is opaque (encrypted end-to-end)

Full content visibility is available for model calls (application-layer) but not for
channel API calls (HTTPS passthrough). This is an acceptable tradeoff — you know OpenClaw
talked to Telegram at 3am even if you can't read the message content. SSL inspection
(custom CA cert MITM) is possible as a future enhancement but is invasive and out of scope.

### 3. Inbound Webhook Traffic (channels → OpenClaw)

**Mechanism:** HermitClaw ingress routing (Phase 5 in original plan). Messaging services
call HermitClaw's public webhook endpoint. HermitClaw routes internally to OpenClaw on
`sand_bed`. OpenClaw never needs a public port.

**Status:** Deferred — this is Phase 5 (Ingress Routing) in the roadmap. For now,
OpenClaw can handle inbound directly during dev (running on host or with port published
for testing). Production deployment waits for ingress routing build.

---

## Model Provider Design

### New Data Model: `ModelProvider`

```prisma
model ModelProvider {
  id          String   @id @default(cuid())
  name        String   @unique   // e.g. "ollama-local", "openai", "anthropic"
  baseUrl     String             // e.g. "http://host.docker.internal:11434"
  protocol    Protocol           // openai | anthropic (maps to API format)
  pearlService String?           // null = no auth; set = look up pearl for cred injection
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("model_providers")
}

enum Protocol {
  OPENAI      // OpenAI-compatible (/v1/chat/completions)
  ANTHROPIC   // Anthropic native (/v1/messages)
}
```

### SSRF Guard Exemption for Providers

The SSRF guard applies to agent-controlled URLs (via `/v1/execute`). Model provider URLs are
admin-configured — the agent never controls the destination. Therefore, provider-to-backend
requests bypass the IP-range SSRF check entirely.

The distinction is critical:
- `/v1/execute`: agent says "call THIS url" → SSRF guard applies
- `/v1/chat/completions`: agent says "give me a completion" → HermitClaw resolves URL from
  its own admin config → no agent-controlled SSRF surface

### Ollama on Mac Host

Ollama runs directly on the Mac host (not in Docker) to use Apple Silicon unified memory.

| Context | Ollama URL | Notes |
|---------|-----------|-------|
| Dev (backend on host) | `http://localhost:11434` | Both on host, direct |
| Docker (hermit_shell in container) | `http://host.docker.internal:11434` | Docker → host |

`OLLAMA_BASE_URL` env var in `.env` with appropriate default per deployment mode.

### Credential Injection

| Provider | `pearlService` | Auth injected |
|---------|---------------|---------------|
| Ollama (local) | `null` | None — Ollama is unauthenticated |
| OpenAI | `"openai"` | `Authorization: Bearer <key>` from vault |
| Anthropic | `"anthropic"` | `x-api-key: <key>` + `anthropic-version` header |

Future providers are zero-code additions: create a `ModelProvider` record, store the
credential as a pearl, done.

---

## Network Topology

```yaml
networks:
  sand_bed:
    internal: true      # no internet (existing)
  open_ocean:
    driver: bridge      # internet access (existing, for hermit_shell egress)

# hermit_shell: sand_bed + open_ocean (unchanged)
# hermit_db:    open_ocean only (NOT sand_bed → openclaw cannot reach DB)
# openclaw:     sand_bed only (no internet, all traffic via HTTP_PROXY)
```

`hermit_db` intentionally stays off `sand_bed` — OpenClaw has no path to the database even
if it somehow breaks out of its container process. HermitClaw mediates all data access.

---

## OpenClaw Container Security Profile

Extends the existing clawbot security profile from session 006:

```yaml
openclaw:
  image: ghcr.io/openclaw/openclaw:latest   # or custom build
  container_name: openclaw
  networks: [sand_bed]
  read_only: true
  user: "1000:1000"
  cap_drop: [ALL]
  security_opt:
    - no-new-privileges:true
  tmpfs:
    - /tmp:size=256m,noexec        # larger for OpenClaw session data
  mem_limit: 2g                    # generous for LLM context handling
  cpus: 1.0
  pids_limit: 128
  environment:
    - HTTP_PROXY=http://hermit_shell:3000
    - HTTPS_PROXY=http://hermit_shell:3000
    - SHELL_URL=http://hermit_shell:3000
    - AGENT_NAME=openclaw
  volumes:
    - openclaw_state:/state                     # persistent agent state
    - ./workspaces/openclaw:/workspace          # bind mount (optional)
    - openclaw_token:/run/hermit:ro             # crab token (read-only)
  depends_on:
    - hermit_shell
```

---

## Bootstrap Sequence (No Race Condition)

```
1. docker compose up -d hermit_db hermit_shell
2. scripts/clawbot-add.sh openclaw          ← registers crab, writes token
3. Provisioning writes openclaw.json with hermitclaw provider config
4. docker compose up -d openclaw            ← reads token, starts agent
5. OpenClaw calls /v1/chat/completions → hermit_shell → Ollama
```

Steps 1-3 complete before step 4 starts. No chicken-and-egg.

---

## Build Plan

### Phase 8A — Model Proxy

**Files to create/modify:**
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `ModelProvider` model + `Protocol` enum |
| `src/routes/model.ts` | New: `POST /v1/chat/completions` (OpenAI-compat proxy) |
| `src/lib/ssrf.ts` | Add provider bypass flag to `isSafeUrl()` |
| `src/lib/auth.ts` | Ensure `requireCrab` works for model route |
| `web/src/pages/ProvidersPage.tsx` | New: Providers tab in Tide Pool UI |
| `web/src/api/client.ts` | Add provider CRUD functions |
| `web/src/api/types.ts` | Add `ModelProvider` type |
| `web/src/App.tsx` | Add Providers tab |
| `.env.example` | Add `OLLAMA_BASE_URL` |

**Anthropic route deferred** — start with OpenAI-compat only (covers Ollama + OpenAI).
Add Anthropic native route when needed.

### Phase 8B — HTTP CONNECT Proxy

**Files to create/modify:**
| File | Change |
|------|--------|
| `src/routes/connect.ts` | New: HTTP CONNECT tunnel handler |
| `src/index.ts` | Register CONNECT handler |
| `src/lib/connect-log.ts` | Log CONNECT tunnels to tides |

**Scope:** Log host + port + crab ID per tunnel. Domain blocklist configurable via env
or future DB table. SSL inspection out of scope.

### Phase 8C — OpenClaw Provisioning

**Files to create/modify:**
| File | Change |
|------|--------|
| `docker-compose.yml` | Add `openclaw` service |
| `scripts/clawbot-add.sh` | Create: register + provision clawbot |
| `scripts/clawbot-remove.sh` | Create: revoke + teardown |
| `scripts/clawbots-sync.sh` | Create: idempotent convergence |
| `clawbots.yml.example` | Create: user-facing config template |
| `examples/openclaw/openclaw.json` | Create: OpenClaw provider config template |

### Phase 8D — Inbound Routing (deferred)

Messaging channels → HermitClaw public webhook → internal routing to OpenClaw.
Design exists in STATUS.md Phase 5. Build after 8A-8C are stable.

---

## Decisions Made

- **OpenClaw in Docker on `sand_bed`** — no direct internet access
- **HTTP_PROXY for full outbound coverage** — zero OpenClaw code changes, works via Node.js env
- **Application-layer proxy for model calls** — full content logging, streaming support
- **CONNECT proxy for channel/tool calls** — host+port auditing, content opaque (HTTPS)
- **SSL inspection out of scope** — invasive, not needed for current threat model
- **Ollama on Mac host** — uses Apple Silicon unified memory, reached via `host.docker.internal`
- **Start with OpenAI-compat route only** — covers Ollama + OpenAI; Anthropic native added later
- **`pearlService: null` = no-auth** — Ollama needs no credential; future-proof for cloud providers
- **Inbound routing deferred** — Phase 5 in original plan, build after model proxy is stable

---

## Open Questions / Deferred Decisions

- Should the CONNECT proxy support a domain **allowlist** (default deny) or **denylist** (default allow)?
  Default allow is easier to start with; default deny is more secure. Decision needed before 8B.
- Should `ModelProvider` records be crab-scoped (per agent) or global (shared)?
  Current design: global (any authenticated crab can use any provider). Crab-scoping is a future
  enhancement for multi-tenant setups.
- Streaming: `/v1/chat/completions` with `stream: true` needs chunked response passthrough.
  Must be handled in the model route — do not buffer the full response before returning.
