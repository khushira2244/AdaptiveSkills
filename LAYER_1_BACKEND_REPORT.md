# Layer 1 backend completion report

Backend scope: PASS. Full React Native vertical slice: PENDING frontend/device verification.

## Delivered behavior

- Signup/login with normalized unique email, salted scrypt password hashing, opaque sessions, expiry and logout.
- Authenticated learner ownership, without trusting learner IDs from client input.
- Unified onboarding state and atomic version-checked saves.
- Profile, current role, experience, optional CV reference, custom skills and subskills, self-assessments, free-text goal, interests, timeline and pace.
- Explicit persisted step advancement and required-field checks.
- Completion persists an unpaid-Home routing state without introducing billing.
- CV PDF/DOCX/TXT parsing runs in a separate process. Suggestions do not change learner data unless confirmed.
- Seven requested service groups implemented as logical modules in one API.
- Original migration 001 and original persistence repositories are unchanged.

## Verification results

- npm run typecheck: PASS across all workspaces.
- npm test: PASS, 21 API/config tests.
- Database-backed suite: PASS, 27 reported tests (25 scenarios and two parent groups), no skips.
- Repeated and concurrent migrations: PASS, with checksum verification.
- Part 2 persistence/constraint/rollback checks: PASS after the added migration.
- Custom skill draft and exact skills step survive app recreation and fresh login: PASS.
- Actual separate server processes: authenticated partial onboarding survives process shutdown/restart with the same token and saved state.
- Cross-learner access, missing/invalid/expired/revoked sessions: PASS.
- Concurrent saves: one succeeds, stale writer gets 409; state is not overwritten.
- PDF, DOCX and text suggestions plus invalid-file preservation: PASS.
- Completion persists, is idempotent, and returns UNPAID_HOME: PASS.
- Auth rate limiting and secret configuration validation: PASS.
- npm ls --depth=0: resolved.
- npm install audit: zero vulnerabilities reported at install time.
- Source inspection: centralized environment reading; no real credentials or frontend changes introduced.

Verification used a temporary native PostgreSQL cluster and a database named adaptive_labs. The runner is in the task's work/run-part2-postgres.mjs; it now runs both persistence and onboarding suites, checks migrations twice, and exercises real API restarts. The database server was stopped after verification.

Initial checks found a reserved SQL column name and a Windows native PDF dependency crash when using worker threads. The new migration column was corrected before successful application. CV parsing now runs in a separate process; PDF, DOCX and TXT tests pass. No applied production migration was edited.

## Docker result

Docker CLI/Compose are available, but the daemon is not reachable from this session. The final check reported the docker_engine named pipe did not exist. Earlier session attempts also encountered named-pipe access denial.

Added a PostgreSQL-only compose.yaml with adaptive_labs database, loopback port, health check, and persistent named volume. docker compose config --quiet passed with a nonsecret validation placeholder. Container startup, Docker-specific migrations/tests, and volume recreation could not be verified. This did not block backend work.

The local environment generator creates random untracked credentials and uses 5432 or 5433 based on availability. It does not overwrite an existing .env. No application .env with real credentials was created in the deliverable.

## Architecture decisions and limits

- The user moved from the old numbered backend parts to Layer 1 backend-first. This implementation follows that newer scope.
- Free-text onboarding intent lives in learner_goal_intents. No profile version, AI mapping, or capability claims are invented; later target analysis can associate the existing versioned learner_goals model.
- Skills and subskills remain learner self-assessments. CV confirmations add candidates with no asserted depth.
- Partial saves stay on the current step. Advancement is explicit and server-validated. The client must send the latest version and reconcile 409 conflicts.
- Zero experience and empty skills/interests are valid. CV is optional.
- Onboarding edits are locked after completion; later profile/settings changes are outside this layer.
- Email verification, password recovery, social login and refresh tokens are not included.
- Rate limits are local to the single API process; production proxy/distributed settings are not configured.
- CV extraction is conservative keyword matching, first 20 PDF pages, no OCR. Private local storage is appropriate for current local work; deployment needs the planned durable object-storage adapter.
- PostgreSQL/Cloud SQL architecture is unchanged. Cloud SQL was not provisioned or tested.
- The full Layer 1 is not accepted until the real React Native flow proves save, app-kill/relaunch, restore and final routing.
- Layer 2/payment, JD analysis, learning maps, modules and labs were not started.

## Source files created

- `compose.yaml`
- `scripts/init-local-env.mjs`
- `LAYER_1_API.md`
- `LAYER_1_BACKEND_REPORT.md`
- `packages/contracts/src/onboarding.ts`
- `packages/db/migrations/002_learner_onboarding.sql`
- `packages/db/src/identity.ts`
- `packages/db/src/onboarding.ts`
- `packages/db/test/document-fixtures.mjs`
- `packages/db/test/onboarding.test.mjs`
- `services/api/src/check-database.ts`
- `services/api/src/http-error.ts`
- `services/api/src/identity/service.ts`
- `services/api/src/onboarding/routes.ts`
- `services/api/src/onboarding/service.ts`
- `services/api/src/resume/parser-process.ts`
- `services/api/src/resume/service.ts`

## Source files modified

- `.env.example`
- `.gitignore`
- `README.md`
- `package.json`
- `package-lock.json`
- `packages/contracts/src/index.ts`
- `packages/db/package.json`
- `packages/db/tsconfig.json`
- `packages/db/src/index.ts`
- `packages/db/test/persistence.test.mjs`
- `services/api/package.json`
- `services/api/src/app.ts`
- `services/api/src/config.ts`
- `services/api/src/errors.ts`
- `services/api/test/config.test.ts`

Generated build outputs and node_modules were refreshed. The temporary parser-worker implementation was replaced by parser-process before delivery; its unused compiled artifacts were removed. Task work/ contains verification runtimes, clusters and the updated runner, not application source.

## Dependencies added

- @fastify/rate-limit 11.2.0
- pdf-parse 2.4.5
- mammoth 1.12.3
- Local packages/db link to packages/contracts

See LAYER_1_API.md for endpoint schemas and README.md for local setup, migrations and connection checks.
