# Session 003 — Phase 2: Execute Gateway

**Date:** 2026-02-16
**Agent:** Claude (claude-sonnet-4-5)
**Phase:** 2 — Execute Gateway
**Status:** Complete

---

## Goal

Implement the MVP core: an authenticated agent can call `POST /v1/execute`, the Hermit Shell looks up and decrypts the right credential, injects it into an outbound HTTP request, executes the call, logs everything to `tides`, and returns the result.

---

## Work Done

### `src/lib/auth.ts` — Agent Auth Middleware
- `requireCrab` prehandler: validates `Authorization: Bearer <token>` against the `crabs` table
- Returns `401` if header is missing/malformed or token is invalid
- Returns `403` if the agent's `active` flag is `false` (killed)
- On success, attaches `request.crab = { id, name }` for downstream handlers
- Uses Fastify module augmentation (`declare module 'fastify'`) for full type safety

### `src/lib/injector.ts` — Credential Injector
Handles four injection strategies:

| `authType` | Behaviour | `paramName` required? |
|------------|-----------|----------------------|
| `bearer` | Sets `Authorization: Bearer <secret>` | No |
| `basic` | Base64-encodes `secret` as `Authorization: Basic <b64>` | No |
| `header` | Sets `<paramName>: <secret>` as a custom header | Yes |
| `queryparam` | Appends `?<paramName>=<secret>` to the URL | Yes |

- Pure function — takes `(url, secret, config)` and returns `{ url, headers }`
- Exhaustive switch with `never` type guard to catch unhandled auth types at compile time

### `src/routes/execute.ts` — Execute Route

`POST /v1/execute` — protected by `requireCrab` prehandler.

**Request flow:**
1. Validate `service` + `url` are present
2. SSRF guard — reject `localhost`, `127.0.0.1`, `*.internal` URLs
3. Look up `pearl` by `(crabId, service)` — 404 if not registered
4. Decrypt secret via `decryptPearl` — 500 if decryption fails (wrong key / tampered)
5. Inject credential via `injectCredential` per `authType`
6. Execute outbound HTTP request via `undici`
7. Log request + sanitized response to `tides` (audit log)
8. Return `{ statusCode, body }` to agent

**Error handling:** every error path writes a `tides` record before returning. Audit log failures are swallowed — they must never crash the gateway.

**Response body sanitization:** before logging, `sanitizeResponseBody` redacts any key/value pairs whose key looks like a secret (`token`, `key`, `secret`, `password`, `api_key`). Bodies are capped at 4096 chars.

### `src/index.ts`
Registered `executeRoutes` plugin.

---

## Decisions Made

- **SSRF guard** added proactively — without it an agent could call `http://hermit_db:5432` or internal services. Blocking `localhost`, `127.0.0.1`, `*.internal` covers the main cases. Private IP ranges (10.x, 192.168.x) are a future hardening item.
- **`authType` defaults to `bearer`** — the most common case; agents only need to specify it when using header/queryparam auth.
- **Audit log failures are swallowed** — a broken DB connection must not stop tool calls from working. The gateway's primary job is proxying.
- **`logTide` always fires**, even on error paths — this ensures the audit trail is complete, not just for successful calls.
- **Response body returned at upstream's status code** — if GitHub returns a 404, the agent gets a 404. The Hermit Shell doesn't remap status codes.

---

## Security Notes

- Decrypted secrets are never logged, stored in variables beyond their immediate use, or returned to the agent
- The SSRF guard prevents agents from using the Hermit Shell to probe internal Docker services
- Response bodies are sanitized before hitting the audit log to prevent credential leakage via API responses

---

## Known Issues / Deferred

- **Private IP range SSRF** — `10.x.x.x`, `172.16.x.x`, `192.168.x.x` are not yet blocked. Low risk in Docker (agents are on `sand_bed` which can't reach `open_ocean` internals), but worth adding.
- **No rate limiting** — agents can spam `/v1/execute`. Add per-crab rate limiting before production.
- **No request timeout** — undici will wait indefinitely on slow upstreams. Add a timeout (e.g. 30s).
- **No JSON Schema validation** on request bodies — type safety is TypeScript-only. Add Fastify schemas for runtime validation.

---

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | `requireCrab` prehandler — agent bearer token validation |
| `src/lib/injector.ts` | Credential injection for Bearer, Basic, Header, QueryParam |
| `src/routes/execute.ts` | `POST /v1/execute` — the gateway route |

## Files Modified

| File | Change |
|------|--------|
| `src/index.ts` | Registered `executeRoutes` plugin |
