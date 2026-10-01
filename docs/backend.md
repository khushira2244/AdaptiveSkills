# Backend

The production backend is a TypeScript Fastify service in `services/api`. It consumes shared Zod contracts from `packages/contracts`, domain code from `packages/domain`, and PostgreSQL repositories and migrations from `packages/db`.

## Responsibilities

- email/password identity, bearer sessions, logout, and ownership checks;
- revisioned onboarding, profile, resume extraction/confirmation, reviewed skills, goals, interests, and preferences;
- frontend-oriented Home state and `primaryAction`;
- purchase intents, RevenueCat webhook handling, and entitlement reconciliation;
- goal/JD analysis, learning maps, scope confirmation, unit generation, and persistent teaching;
- notes, marked words, doubts, lesson progress, lab attempts, drafts, checks, hints, System Assistance, submissions, and evidence;
- continuation analysis, purchase reconciliation, and progressive activation of the next runway.

Every `/me/*` route uses the authenticated learner identity. Client-supplied learner IDs do not replace server ownership checks. Validation errors use shared contracts and stale version writes return a conflict instead of overwriting newer state.

## Database and migrations

PostgreSQL is authoritative. Sixteen ordered SQL migrations currently cover the foundation, onboarding, commerce, skill sources, learning scope, reasoning, continuation, teaching interactions, labs, hints, and growth entitlement. `schema_migrations` records applied checksums. Migrations run through `npm run db:migrate`; clients never run them.

The API accepts a normal PostgreSQL URL or a Cloud SQL socket URL whose `host` query parameter begins with `/cloudsql/`. Startup checks the database connection before serving when `DATABASE_URL` is configured.

## Production configuration

Cloud Run injects server configuration. Secret Manager holds `DATABASE_URL`, `AUTH_SECRET`, `OPENAI_API_KEY`, `REVENUECAT_SECRET_API_KEY`, and `REVENUECAT_WEBHOOK_AUTH_TOKEN`. RevenueCat identifiers, model settings, CORS origins, and storage configuration are non-secret environment values.

`WEB_ORIGINS` is an explicit comma-separated allowlist. It must include the exact Vercel origin; permissive wildcard credentials are not used. The public `GET /health` route provides liveness. Application logs and request IDs support Cloud Run diagnosis without returning internal errors or secret values to clients.

## Clean builds

Google Buildpacks may invoke the API workspace directly. Its `build` and `gcp-build` scripts first run the root shared-package build, then compile the API. Root builds follow:

```text
contracts → domain → db → api
```

This avoids relying on ignored local `dist` folders.
