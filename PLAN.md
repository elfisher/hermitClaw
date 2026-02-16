# HermitClaw — Implementation Plan

> **Goal:** Get a working vertical slice end-to-end as fast as possible.
> **MVP Definition:** A sandboxed agent can call `POST /v1/execute`, the Shell injects a real credential, makes the API call, and returns the result — all audited.

---

## Phase 0 — Repo Scaffold
**Goal:** Everything compiles. `docker compose up` brings up Shell + Postgres.

- [ ] Monorepo structure: `src/`, `web/`, `examples/`, `infra/`
- [ ] `package.json` with TypeScript, Fastify, Prisma, tsx
- [ ] `tsconfig.json`
- [ ] Fastify entry point (`src/index.ts`) — health check route only
- [ ] `docker-compose.yml` — Shell + Postgres, correct networks (`sand_bed`, `open_ocean`)
- [ ] `.env.example` with `MASTER_PEARL`, `DATABASE_URL`
- [ ] `Dockerfile` for the Shell service
- [ ] Verify: `docker compose up` — Shell responds on `:3000/health`

---

## Phase 1 — Crypto + Vault
**Goal:** Secrets can be stored and retrieved encrypted. Nothing in the DB is plaintext.

- [ ] `src/lib/crypto.ts` — AES-256-GCM `encryptPearl` / `decryptPearl`
- [ ] Prisma schema: `crabs`, `pearls`, `tides`, `routes` tables
- [ ] Initial migration
- [ ] `POST /v1/secrets` — store encrypted credential for an agent
- [ ] `GET /v1/secrets` — list secrets (keys only, no decrypted values)
- [ ] `src/lib/db.ts` — Prisma client singleton
- [ ] Verify: store a secret via curl, confirm DB row is encrypted

---

## Phase 2 — The Execute Gateway ← MVP Core
**Goal:** An agent can call `/v1/execute` and the Shell proxies the request with injected credentials.

- [ ] `POST /v1/execute` route (`src/routes/execute.ts`)
- [ ] Agent auth middleware — validate `Authorization: Bearer <agent_token>` against `crabs` table
- [ ] Credential injector — look up pearl, decrypt, inject into outbound request headers
- [ ] HTTP proxy — execute the real API call using `undici` or `node-fetch`
- [ ] Audit logging — write every request + response summary to `tides`
- [ ] Support auth types: `Bearer`, `Basic`, `Header`, `QueryParam`
- [ ] Verify: sandboxed agent calls `/v1/execute` → GitHub API responds → logged in `tides`

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

## Phase 5 — Ingress Routing *(deferred / post-MVP)*
**Goal:** External messages (Signal/WhatsApp) are routed to the correct agent container.

- [ ] `POST /v1/ingress/:provider` route
- [ ] `routes` table lookup — match message pattern → target agent container
- [ ] Forward payload to agent's internal webhook endpoint
- [ ] Verify: Signal message reaches correct agent via Shell routing

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
