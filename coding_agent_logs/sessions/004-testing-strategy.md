# Session 004 — Testing Strategy

**Date:** 2026-02-16
**Agent:** Claude (claude-sonnet-4-5)
**Phase:** Cross-cutting — Testing
**Status:** Complete

---

## Goal

Establish a solid testing foundation before building the UI. Cover all existing logic (crypto, injector, auth, all routes) with a fast, reliable test suite that runs without Docker.

---

## Result

**53 tests passing, 0 failures, first run.**

```
✓ tests/unit/injector.test.ts   (11 tests)
✓ tests/unit/crypto.test.ts     (12 tests)
✓ tests/routes/crabs.test.ts    (7 tests)
✓ tests/routes/secrets.test.ts  (9 tests)
✓ tests/routes/execute.test.ts  (14 tests)
```

---

## What Was Built

### Framework
- **Vitest** — ESM-native, fast, Jest-compatible API. Ideal fit for this NodeNext/ESM project.
- **`@vitest/coverage-v8`** — coverage via Node's built-in V8 engine (no Babel/transpilation overhead)

### Test Scripts (package.json)
| Script | Purpose |
|--------|---------|
| `npm test` | Single run (for CI) |
| `npm run test:watch` | Watch mode during development |
| `npm run test:coverage` | Run with coverage report |

### Directory Structure
```
tests/
  helpers/
    app.ts        — builds Fastify test instance (logger disabled)
    db-mock.ts    — shared Prisma mock with vi.fn() for all used methods
  unit/
    crypto.test.ts
    injector.test.ts
  routes/
    crabs.test.ts
    secrets.test.ts
    execute.test.ts
```

### Test Helpers

**`tests/helpers/db-mock.ts`**
Shared mock Prisma client using `vi.fn()` for every method used across the codebase. Each test file imports this and registers it via `vi.mock('../../src/lib/db.js', () => ({ db: mockDb }))`. `resetDbMocks()` clears all call history in `beforeEach`.

**`tests/helpers/app.ts`**
Builds a Fastify instance with all routes registered. Logger disabled for clean output. All tests use `app.inject()` — no network, no port binding.

---

## Coverage by Module

### `crypto.ts` (12 tests)
- `encryptPearl`: returns correct shape, hex strings, unique IVs, 16-byte IV
- `encryptPearl`: throws on missing/wrong-length `MASTER_PEARL`
- `decryptPearl`: roundtrip with ASCII and Unicode/emoji secrets
- `decryptPearl`: throws on tampered authTag, encryptedBlob, or IV
- `decryptPearl`: throws if `MASTER_PEARL` removed between encrypt and decrypt

### `injector.ts` (11 tests)
- All four auth types (`bearer`, `basic`, `header`, `queryparam`)
- `basic` correctly base64-encodes `user:pass`
- `queryparam` preserves existing query parameters
- `header` and `queryparam` throw when `paramName` is missing
- Default headers (`Content-Type`, `User-Agent`) always set

### `crabs.ts` routes (7 tests)
- `POST /v1/crabs`: creates agent, returns token; 400 on missing name; 409 on duplicate
- `GET /v1/crabs`: returns list, tokens never present in response
- `PATCH /v1/crabs/:id/revoke`: deactivates agent; 404 if not found

### `secrets.ts` routes (9 tests)
- `POST /v1/secrets`: encrypts before storing (plaintext never in response or upsert call); 400/404 on bad input; upsert on duplicate (crabId, service)
- `GET /v1/secrets`: encrypted fields never returned; `crabId` filter applied correctly; no filter → `where: undefined`
- `DELETE /v1/secrets/:id`: deletes; 404 if missing

### `execute.ts` routes (14 tests)
- Auth: 401 (no header), 401 (malformed), 401 (wrong token), 403 (revoked)
- Validation: 400 (missing service/url), 400 (invalid URL)
- SSRF guard: blocks `localhost`, `127.0.0.1`, `*.internal`
- Happy path: decrypts credential, calls upstream with injected auth, logs to tides, returns body
- Upstream passthrough: non-200 status codes flow through unchanged
- Errors: 404 on missing pearl (with tide log), 502 on network failure (with tide log)

---

## Decisions Made

- **`vi.mock` with shared `mockDb`** — each route test file re-registers the same mock object. `vi.clearAllMocks()` in `beforeEach` resets call history without recreating the object, so module-level `vi.mock` factories don't re-run.
- **`undici` fully mocked** in execute tests — no real HTTP calls, deterministic responses.
- **`buildApp()` called per-test** — fresh Fastify instance per describe block prevents state bleed between tests.
- **Dynamic import for `encryptPearl`** in execute tests — creates real encrypted fixtures so decrypt path is actually exercised (not bypassed by a fake blob).
- **E2E tests deferred** — full stack tests (real DB, real Docker) deferred until Docker daemon is verified. Add a `test:e2e` script at that point.
