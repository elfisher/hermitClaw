# Session 005 — Phase 3: Tide Pool UI

**Date:** 2026-02-16
**Agent:** Claude (claude-sonnet-4-5)
**Phase:** 3 — Tide Pool UI
**Status:** Complete

---

## Goal

Build the React control panel so HermitClaw is operable by humans without needing to curl the API. Three pages: Agents, Secrets, Audit Log. Served statically by the Fastify Shell.

---

## Result

- Vite + React + Tailwind builds clean (`web/dist/`)
- Server `tsc` compiles clean
- 53/53 tests still passing (no regressions)
- `web/dist` is served at `/` by Fastify in production
- Dev: `cd web && npm run dev` with proxy to `:3000`

---

## Server-side additions

### `src/routes/tides.ts`
`GET /v1/tides` — paginated audit log.
- Query params: `?page=1&limit=50&crabId=<id>`
- Returns `{ tides, pagination: { page, limit, total, pages } }`
- Includes `crab: { name }` join on each tide entry for display
- Limit capped at 100 per request

### `src/index.ts` updates
- Added `tidesRoutes` registration
- Added `@fastify/static` serving `web/dist` at `/` (only if `web/dist` exists — graceful fallback with warning)
- SPA fallback: `setNotFoundHandler` returns `index.html` for all non-`/v1/` routes
- Uses `process.cwd()` for `web/dist` path — works in both dev and Docker

---

## Web app (`web/`)

### Stack
| Tool | Version | Purpose |
|------|---------|---------|
| Vite | 7.x | Build tool |
| React | 18.x | UI framework |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.x | Styling |

### Structure
```
web/
  src/
    api/
      types.ts      — Crab, Pearl, Tide, Pagination interfaces
      client.ts     — typed fetch wrappers for all API endpoints
    pages/
      AgentsPage.tsx
      SecretsPage.tsx
      AuditLogPage.tsx
    App.tsx         — tab shell (Agents | Secrets | Audit Log)
    main.tsx        — React entry point
    index.css       — Tailwind directives
  vite.config.ts    — dev proxy: /v1/* → localhost:3000
  tailwind.config.js
  postcss.config.js
  tsconfig.json
  package.json
```

### Pages

**AgentsPage**
- Table of all agents with name, active/revoked status badge, registration date
- "Register Agent" form — name input, creates agent via `POST /v1/crabs`
- Token reveal panel — shown once after creation with amber warning and dismiss button
- "Revoke" button per active agent — calls `PATCH /v1/crabs/:id/revoke` with confirmation dialog

**SecretsPage**
- Agent selector dropdown (defaults to first agent)
- Table of secrets — service name, label, masked value (••••••••), last updated
- "Add Secret" inline form — service, label, password input for plaintext
- "Delete" per secret with confirmation

**AuditLogPage**
- Table of tides: timestamp, agent name, direction badge, target URL, status code (color-coded), error
- Status code coloring: green (<300), blue (<400), amber (<500), red (≥500)
- Pagination controls (prev/next) when `pages > 1`
- Manual refresh button

---

## Decisions Made

- **No React Router** — simple tab state in `App.tsx`. Three pages don't need URL routing for MVP, avoids SPA fallback complexity.
- **Vite dev proxy** — `vite.config.ts` proxies `/v1/*` to `localhost:3000` so `npm run dev` works without CORS config.
- **Graceful UI absence** — server logs a warning if `web/dist` doesn't exist but boots fine. No hard dependency.
- **Token shown once** — amber alert panel matches server behavior; dismissed by user after copying.
- **Vite upgraded 5 → 7** — esbuild moderate vuln in dev server; fixed by upgrading. 0 vulnerabilities post-upgrade.

---

## Known Issues / Deferred

- No loading skeletons — pages flash "Loading…" text. Fine for MVP.
- No optimistic updates — mutations trigger a full re-fetch. Simple and correct.
- Audit log doesn't auto-refresh — manual refresh button. WebSocket/SSE live stream is Phase 5+.
- `web/node_modules` is not gitignored at root level — added to root `.gitignore`.

---

## Files Created

| File | Purpose |
|------|---------|
| `src/routes/tides.ts` | `GET /v1/tides` — paginated audit log |
| `web/package.json` | Web app deps: React 18, Vite 7, Tailwind 3 |
| `web/tsconfig.json` | Frontend TypeScript config |
| `web/vite.config.ts` | Vite config + dev proxy |
| `web/tailwind.config.js` | Tailwind content config |
| `web/postcss.config.js` | PostCSS with Tailwind + autoprefixer |
| `web/index.html` | HTML entry point |
| `web/src/main.tsx` | React entry point |
| `web/src/index.css` | Tailwind directives |
| `web/src/App.tsx` | Tab shell |
| `web/src/api/types.ts` | Shared TypeScript types |
| `web/src/api/client.ts` | Typed fetch wrappers |
| `web/src/pages/AgentsPage.tsx` | Agent management + kill switch |
| `web/src/pages/SecretsPage.tsx` | Secret CRUD |
| `web/src/pages/AuditLogPage.tsx` | Paginated audit log |

## Files Modified

| File | Change |
|------|--------|
| `src/index.ts` | Added tidesRoutes, @fastify/static, SPA fallback |
