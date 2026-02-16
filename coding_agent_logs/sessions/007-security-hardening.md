# Session 007 — Security Hardening

## Date: 2026-02-16

## Completed Tasks:

- **P0: Admin API auth**: Implemented API key authentication for management routes.
  - Added an `ADMIN_API_KEY` to the `.env.example` file.
  - Created a new authentication pre-handler in `src/lib/auth.ts` that checks for the `ADMIN_API_KEY`.
  - Applied this pre-handler to the management routes in `src/routes/crabs.ts`, `src/routes/secrets.ts`, and `src/routes/tides.ts`.
  - Added a new test file (`tests/routes/admin.test.ts`) to test the new authentication pre-handler.
- **P0: No tool allowlisting**: Added a tool allowlist to the `Crab` schema and enforce it in the execute route.
  - Added an `allowedTools` JSON field to the `Crab` model in `prisma/schema.prisma`.
  - Modified the `execute` route in `src/routes/execute.ts` to check if the tool is allowed based on `crab.allowedTools`.
  - Added a new test file (`tests/routes/execute-allowlist.test.ts`) to test the tool allowlisting functionality.
- **P1: Default DB password**: Eliminated hardcoded database password.
  - Modified `docker-compose.yml` to use `DB_PASSWORD` environment variable for `POSTGRES_PASSWORD`.
  - Updated `.env.example` to reflect this change.
- **P1: Incomplete SSRF guard**: Enhanced SSRF protection.
- **P2: No rate limiting on `/v1/execute`**: Implemented per-crab rate limiting for the execute route.
  - Installed `@fastify/rate-limit` package.
  - Registered `fastifyRateLimit` plugin in `src/routes/execute.ts` with `max: 60` requests per `timeWindow: '1 minute'`.
  - Configured `keyGenerator` to use `request.crab?.id` for per-agent rate limiting.
  - Added a new test file (`tests/routes/rate-limit.test.ts`) to verify rate limiting.
- **P2: No request timeout on outbound calls**: Added a timeout to undici requests.
  - Implemented a 30s timeout for `undiciRequest` in `src/routes/execute.ts` using `AbortController` and custom error handling for `AbortError` (504 Gateway Timeout).
  - Added a new test file (`tests/routes/timeout.test.ts`) to verify timeout functionality.
- **P2: No token rotation**: Implemented optional token expiration.
  - Added an optional `expiresAt` field to the `Crab` model in `prisma/schema.prisma`.
  - Modified `requireCrab` in `src/lib/auth.ts` to check the `expiresAt` field and reject expired tokens with a 403 error.
  - Added a new test file (`tests/unit/token-rotation.test.ts`) to verify token expiration.

## Skipped Tasks:

- **P1: No TLS**: Requires environment setup.
- **P2: Shell injection in provisioning scripts**: Provisioning scripts are not yet built.


## Next Steps

- Address the skipped P1 and P2 security tasks once the Docker and database setup issues are resolved.
- Continue with other P1 and P2 security tasks not dependent on database setup.
