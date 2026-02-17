# HermitClaw — Implementation Plan

> **Goal:** Get a working vertical slice end-to-end as fast as possible.
> **MVP Definition:** A sandboxed agent can call `POST /v1/execute`, the Hermit Shell injects a real credential, makes the API call, and returns the result — all audited.

---

## Phase 0 — Repo Scaffold
**Goal:** Everything compiles. `docker compose up` brings up Shell + Postgres.

- [x] Monorepo structure: `src/`, `web/`, `examples/`, `infra/`
- [x] `package.json` with TypeScript, Fastify, Prisma, tsx
- [x] `tsconfig.json`
- [x] Fastify entry point (`src/index.ts`) — health check route only
- [x] `docker-compose.yml` — Shell + Postgres, correct networks (`sand_bed`, `open_ocean`)
- [x] `.env.example` with `MASTER_PEARL`, `DATABASE_URL`
- [x] `Dockerfile` for the Hermit Shell service
- [x] Verify: `docker compose up` — Shell responds on `:3000/health`

---

## Phase 1 — Crypto + Vault
**Goal:** Secrets can be stored and retrieved encrypted. Nothing in the DB is plaintext.

- [x] `src/lib/crypto.ts` — AES-256-GCM `encryptPearl` / `decryptPearl`
- [x] Prisma schema: `crabs`, `pearls`, `tides`, `routes` tables
- [x] Initial migration
- [x] `POST /v1/secrets` — store encrypted credential for an agent
- [x] `GET /v1/secrets` — list secrets (keys only, no decrypted values)
- [x] `src/lib/db.ts` — Prisma client singleton
- [x] Verify: store a secret via curl, confirm DB row is encrypted

---

## Phase 2 — The Execute Gateway ← MVP Core
**Goal:** An agent can call `/v1/execute` and the Hermit Shell proxies the request with injected credentials.

- [x] `POST /v1/execute` route (`src/routes/execute.ts`)
- [x] Agent auth middleware — validate `Authorization: Bearer <agent_token>` against `crabs` table
- [x] Credential injector — look up pearl, decrypt, inject into outbound request headers
- [x] HTTP proxy — execute the real API call using `undici` or `node-fetch`
- [x] Audit logging — write every request + response summary to `tides`
- [x] Support auth types: `Bearer`, `Basic`, `Header`, `QueryParam`
- [x] Verify: sandboxed agent calls `/v1/execute` → GitHub API responds → logged in `tides`
- [x] **P0: Admin API Auth** - Secure management routes (`crabs`, `secrets`, `tides`)
- [x] **P0: No tool allowlisting** - Implement tool allowlisting for `execute` route
- [x] **P1: Incomplete SSRF guard** - Enhance SSRF protection
- [x] **P1: Default DB password** - Remove hardcoded DB password in `docker-compose.yml`
- [x] **P2: No rate limiting on `/v1/execute`** - Implement per-crab rate limiting
- [x] **P2: No request timeout on outbound calls** - Add 30s timeout to undici requests
- [x] **P2: No token rotation** - Add optional `expiresAt` field to `crabs` table and check in `requireCrab`

---

## Phase 3 — Python Example Agent
**Goal:** Prove Docker network isolation. Agent has zero direct internet access.

- [ ] `examples/python_bot/Dockerfile` — sandboxed on `sand_bed` network only
- [ ] `examples/python_bot/main.py` — calls `/v1/execute` via Shell, not internet directly
- [ ] Wire into `docker-compose.yml`
- [ ] Verify: agent container cannot reach `api.github.com` directly, but can via Shell

---

## Phase 4 — Tide Pool UI
**Goal:** Humans can manage secrets and watch agent activity from a browser.

- [ ] React + Vite scaffold (`web/`)
- [ ] Secret Manager — add/update/delete pearls
- [ ] Agent List — registered crabs + kill switch (revoke token)
- [ ] Audit Log — paginated view of `tides` table
- [ ] Shell serves `web/dist` statically on `GET /`
- [ ] Verify: full CRUD for secrets via UI, kill switch revokes agent access

---

## Phase 5 — Ingress Routing *(deferred → Phase 8D)*
**Goal:** External messages (Signal/WhatsApp) are routed to the correct agent container.

- [ ] `POST /v1/ingress/:provider` route
- [ ] `routes` table lookup — match message pattern → target agent container
- [ ] Forward payload to agent's internal webhook endpoint
- [ ] Verify: Signal message reaches correct agent via Shell routing

---

## Phase 8A — Model Proxy
**Goal:** Agents call HermitClaw as if it were an OpenAI-compatible API. HermitClaw proxies
to Ollama (local) or cloud providers, injecting credentials from the vault when needed.

- [x] `prisma/schema.prisma` — add `ModelProvider`, `ModelProviderAccess`, `Protocol`, `ProviderScope` enums
- [x] `npx prisma db push` — apply schema changes
- [x] `src/routes/model.ts` — `POST /v1/chat/completions` with streaming passthrough
- [x] `src/lib/ssrf.ts` — add provider bypass (admin-configured providers skip IP check)
- [x] `web/src/pages/ProvidersPage.tsx` — add/edit/delete providers, manage RESTRICTED access
- [x] `web/src/api/client.ts` + `types.ts` — provider CRUD
- [x] `web/src/App.tsx` — add Providers tab to sidebar
- [x] `.env.example` — add `OLLAMA_BASE_URL`
- [ ] Verify: OpenClaw calls `/v1/chat/completions` → HermitClaw → Ollama → streamed response (needs OpenClaw container)

---

## Phase 8B — HTTP CONNECT Proxy + Domain Rules
**Goal:** All outbound traffic from agent containers flows through HermitClaw. Domain
allow/deny rules are configurable in Tide Pool. Default: ALLOW (flip to DENY for prod).

- [ ] `prisma/schema.prisma` — add `ConnectRule`, `RuleAction`, `SystemSetting`
- [ ] `src/routes/connect.ts` — HTTP CONNECT tunnel handler
- [ ] `src/lib/connect-rules.ts` — rule evaluation (priority order, wildcard, per-crab)
- [ ] `src/index.ts` — register CONNECT handler at server level
- [ ] `web/src/pages/NetworkPage.tsx` — manage ConnectRules + default policy
- [ ] `web/src/pages/SettingsPage.tsx` — SystemSettings (cookie TTL, proxy default, etc.)
- [ ] `web/src/App.tsx` — add Network + Settings tabs
- [ ] Verify: agent container with `HTTP_PROXY=hermit_shell:3000` routes all traffic through Shell; blocked domain returns 403

---

## Phase 8C — Agent UI Proxy + Cookie Auth + OpenClaw Provisioning
**Goal:** OpenClaw's full web UI (WebChat + Control) is accessible through HermitClaw at
`/agents/openclaw/`, auth-gated by a signed session cookie set at Tide Pool login.
Provisioning scripts bootstrap agent containers end-to-end.

- [ ] `prisma/schema.prisma` — add `Crab.uiPort` field
- [ ] `src/lib/session.ts` — signed session cookie issue/verify (HMAC-SHA256)
- [ ] `src/routes/auth.ts` — `POST /v1/auth/login` → validates admin key → sets cookie
- [ ] `src/routes/agent-ui.ts` — `/agents/:name/*` reverse proxy + WebSocket upgrade passthrough
- [ ] `web/src/pages/LoginPage.tsx` — admin key entry form
- [ ] `web/src/App.tsx` — login gate (check session cookie; redirect to login if absent)
- [ ] `web/src/pages/AgentsPage.tsx` — "Open UI" button when `uiPort` is set
- [ ] `docker-compose.yml` — add `openclaw` service (sand_bed, HTTP_PROXY, read_only, etc.)
- [ ] `scripts/clawbot-add.sh` — register crab, write token, write openclaw.json config
- [ ] `scripts/clawbot-remove.sh` — revoke crab, stop container, optionally destroy data
- [ ] `scripts/clawbots-sync.sh` — idempotent convergence from `clawbots.yml`
- [ ] `clawbots.yml.example` — user-facing config template
- [ ] `examples/openclaw/openclaw.json` — OpenClaw hermitclaw provider config template
- [ ] Verify: full bootstrap sequence works end-to-end; OpenClaw UI accessible at `/agents/openclaw/`

---

## Phase 8D — Inbound Routing *(formerly Phase 5)*
**Goal:** Messaging channels (WhatsApp, Telegram, Slack) call HermitClaw's public webhook.
HermitClaw routes internally to the correct agent on `sand_bed`. Agents never need public ports.

- [ ] `POST /v1/ingress/:provider` route
- [ ] `routes` table lookup — match message prefix → target agent container name
- [ ] Forward payload to agent internal endpoint via `sand_bed` network
- [ ] Tide Pool: Routes management tab
- [ ] Verify: inbound webhook reaches correct agent without any public agent port

---

## Stack Summary

| Layer | Technology |
|-------|-----------|
| Gateway | Node.js + TypeScript + Fastify |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| Encryption | AES-256-GCM (Node `crypto`) |
| UI | React + Vite |
| Infra | Docker Compose |
| Example Agent | Python 3 |
