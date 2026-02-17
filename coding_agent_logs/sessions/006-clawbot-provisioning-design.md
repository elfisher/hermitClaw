# Session 006 — Clawbot Provisioning Design + Security Assessment

**Date:** 2026-02-16
**Agent:** Claude (claude-sonnet-4-5)
**Phase:** Design only — no code written
**Status:** Complete (design agreed, build deferred)

---

## Goal

Design the clawbot provisioning system: how users deploy N secure AI agent containers connected to the HermitClaw gateway. Assess security posture of the existing system.

---

## Clawbot Provisioning Design

### Target Environment

- Home server (Mac mini), isolated devices — P0
- Cloud — P2
- HermitClaw runtime-agnostic but ships a default tested image (`hermitclaw/clawbot:latest`)

### `clawbots.yml` Format

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

### Workspace Modes

| Mode | Trigger | `/workspace` in container | State persists | Host FS exposure |
|------|---------|--------------------------|----------------|-----------------|
| 1 — Isolated | No `workspace:` key | Not mounted | Named Docker volume `/state` | None |
| 2 — Dedicated | `workspace: <path>` (sole owner) | Bind mount of that path | Yes | That directory only |
| 3 — Shared group | 2+ bots share same `workspace:` path | Bind mount of shared parent | Yes | Shared parent + sibling subdirs |

**Mode 3 mechanics:** Provisioner auto-creates `./workspaces/project-x/<botname>/` on host. Each bot gets `AGENT_HOME=/workspace/<botname>`. Bots can read (and write per mode) sibling subdirectories — intentional, documented.

### Volume Strategy (per container)

| Volume | Type | Path in container | Persists | Host accessible |
|--------|------|-------------------|----------|----------------|
| `hermit_state_<name>` | Named Docker volume | `/state` | Yes | No (inside VM) |
| `./workspaces/...` | Bind mount (opt-in) | `/workspace` | Yes | Yes (intentional) |
| — | tmpfs | `/tmp` | No | No |

### Container Security Profile

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
Never in env vars, never visible in `docker inspect`.

### Agent Interface (runtime-agnostic)

Any container qualifies as a clawbot if it:
1. Reads token from `/run/hermit/token`
2. Calls `$SHELL_URL/v1/execute` with `Authorization: Bearer <token>`
3. (Optional, Phase 5) Exposes `POST /webhook` on port 8000

Non-secret env vars injected at runtime:
- `SHELL_URL=http://hermit_shell:3000`
- `AGENT_NAME=<name>`

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

## Security Assessment

### P0 — Fix before real use

**Admin API unauthenticated**
- Affected routes: `POST /v1/crabs`, `GET /v1/secrets`, `DELETE /v1/secrets/:id`, `PATCH /v1/crabs/:id/revoke`, `GET /v1/tides`
- Anyone on the network can call them
- Fix: `ADMIN_API_KEY` in `.env`, required `X-Admin-Key` header on all management routes

**Tide Pool UI unauthenticated**
- Same exposure — UI calls the unauthenticated management routes
- Fix: same ADMIN_API_KEY gates the UI (one fix, two problems solved)

**No tool allowlisting**
- Execute route validates *who* is calling but not *what* they can call
- A prompt-injected agent with a valid token can call any URL with any method
- Fix: add `allowedTools: [{ url, method }]` array to pearl/crab schema. Execute route checks before proxying.

### P1 — High priority

**Incomplete SSRF guard**
- Private IP ranges not blocked: `10.x`, `172.16-31.x`, `192.168.x`
- IPv6 loopback (`::1`) not blocked
- DNS rebinding not mitigated (URL could resolve to internal IP at request time)
- Fix: resolve URL to IP, check against RFC-1918 + loopback ranges before executing

**Default DB password**
- `docker-compose.yml` ships `securepass` — most users won't change it
- Fix: require `DB_PASSWORD` env var, no hardcoded default; document in `.env.example`

**No TLS**
- Shell port is plain HTTP; fine for isolated Mac mini, problem on shared networks
- Fix: document reverse proxy requirement (nginx/Caddy) in README

### P2 — Before sharing with others

**Shell injection in provisioning scripts**
- `<name>` param used in shell commands and YAML generation
- Fix: validate to `[a-z0-9-]` only before any use

**No rate limiting on `/v1/execute`**
- Runaway agent can exhaust downstream API rate limits or DoS the Hermit Shell
- Fix: per-crab rate limit (e.g. 60 req/min) using fastify-rate-limit

**No request timeout on outbound calls**
- Slow upstream hangs connection indefinitely
- Fix: 30s timeout on undici requests

**No token rotation**
- Tokens are permanent until manually revoked, no expiry
- Fix: optional `expiresAt` field on crabs table, checked in `requireCrab`

### P3 — Known tradeoffs, document only

- Mode 3 bots can read/write each other's subdirectories — intentional, document it
- `MASTER_PEARL` in `.env` means host compromise = vault compromise — inherent limitation of self-hosted encryption, document clearly
- `.hermit_token` readable by host user — acceptable for single-user home server

---

## Decisions Made

- **Runtime-agnostic gateway** — HermitClaw doesn't care what language/runtime the clawbot uses
- **Default image** — ship `hermitclaw/clawbot:latest` as a tested default; users bring their own image
- **Mode 3 as primary pattern** — shared parent directory is the most common team scenario (multiple bots on same project)
- **Token in file, not env** — env vars leak into `docker inspect`, process listings, and child processes
- **Named volume for `/state`** — survives container restart/recreation, not accessible from host (intentional isolation)
- **tmpfs for `/tmp`** — no-exec prevents script injection persistence

---

## Recommended Build Order

1. Security P0s (admin auth + tool allowlisting)
2. Clawbot Provisioning System
3. Security P1s (SSRF complete, DB password, TLS docs)
4. Phase 4 — Python Example Agent
5. Security P2s (rate limiting, timeouts, token rotation)

---

## Files Modified

| File | Change |
|------|--------|
| `coding_agent_logs/STATUS.md` | Full refresh — added provisioning design + security backlog as checkboxes |
