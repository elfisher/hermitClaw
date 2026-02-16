# Session 002 — Phase 1: Crypto + Vault

**Date:** 2026-02-16
**Agent:** Claude (claude-sonnet-4-5)
**Phase:** 1 — Crypto + Vault
**Status:** Complete

---

## Goal

Implement the encryption core and database layer. Secrets can be stored and retrieved encrypted — nothing sensitive is ever in plaintext in the DB.

---

## Work Done

### Prisma Schema (`prisma/schema.prisma`)
Four tables:
- **`crabs`** — registered agents with bearer tokens and active/revoked status
- **`pearls`** — encrypted credentials; unique per `(crabId, service)` pair
- **`tides`** — audit log for all egress/ingress traffic (used in Phase 2)
- **`routes`** — ingress routing rules for Phase 5

`Direction` enum (`EGRESS` / `INGRESS`) on `tides` for filtering audit logs.

> Note: `prisma init` CLI had a runtime bug (`(0, CSe.isError) is not a function`). Schema was created manually — functionally identical.

### `src/lib/crypto.ts`
- AES-256-GCM encryption via Node `node:crypto` (no external deps)
- `encryptPearl(plaintext)` → `{ encryptedBlob, iv, authTag }` — generates a unique 16-byte IV per call
- `decryptPearl(pearl)` → plaintext — verifies GCM auth tag before decrypting (tamper detection)
- `MASTER_PEARL` read lazily via `getMasterKey()` — throws clearly if not set or wrong length

### `src/lib/db.ts`
- Prisma client singleton using `globalThis` pattern — prevents connection pool exhaustion on hot reload in dev
- Query logging enabled in `development`, errors-only in `production`

### `src/routes/secrets.ts`
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/v1/secrets` | Encrypt and store a credential. Upserts on `(crabId, service)`. Returns pearl metadata — never plaintext. |
| `GET` | `/v1/secrets?crabId=` | List pearls for all agents or filtered by agent. `encryptedBlob`, `iv`, `authTag` intentionally excluded from response. |
| `DELETE` | `/v1/secrets/:id` | Remove a pearl by ID. |

### `src/routes/crabs.ts`
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/v1/crabs` | Register an agent, generate a 32-byte hex bearer token. Token shown once at creation only. |
| `GET` | `/v1/crabs` | List agents — token intentionally omitted from response. |
| `PATCH` | `/v1/crabs/:id/revoke` | Kill switch — sets `active: false` immediately. |

### `src/index.ts`
Registered `crabsRoutes` and `secretsRoutes` plugins.

---

## Decisions Made

- **Upsert on `(crabId, service)`** for pearls — updating an API key re-encrypts with a fresh IV rather than storing multiple versions. Simpler for MVP.
- **Token shown once** at crab creation — mirrors how real secret managers work. No route to retrieve it afterward.
- **`DELETE /v1/secrets/:id`** added beyond plan spec — needed to make the secret manager complete enough to be useful.
- **`PATCH /v1/crabs/:id/revoke`** instead of `DELETE` — agents may need to be re-activated; soft delete is safer.
- **`getMasterKey()` called lazily** (inside encrypt/decrypt, not at module load) — allows the module to be imported in test environments without `MASTER_PEARL` set.

---

## Known Issues

- **Prisma client not yet generated** — `@prisma/client` types are available from the installed package but `prisma generate` needs to run against a live schema once Docker is up. `tsc` passes because Prisma ships base types.
- **No input validation schema** — Fastify JSON Schema validation not yet wired up. Bodies are typed via generics only. Add in a hardening pass.
- **No auth middleware yet** — routes are open. Agent auth (`Authorization: Bearer`) is Phase 2.

---

## Verification

- `npx tsc --noEmit` — zero errors
- DB/runtime verification pending Docker daemon

---

## Files Created

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | DB schema: crabs, pearls, tides, routes tables |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt for secrets |
| `src/lib/db.ts` | Prisma client singleton |
| `src/routes/secrets.ts` | CRUD API for encrypted credentials |
| `src/routes/crabs.ts` | Agent registration + kill switch |

## Files Modified

| File | Change |
|------|--------|
| `src/index.ts` | Registered `crabsRoutes` and `secretsRoutes` plugins |
