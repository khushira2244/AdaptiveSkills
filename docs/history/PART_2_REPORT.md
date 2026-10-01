# Part 2 — Database foundation

> Historical implementation checkpoint. See the current [backend documentation](../backend.md).

Status: PASS

## Changes

Implemented PostgreSQL persistence only: learners, learner goals, versioned target-profile references, active-goal lookup and uniqueness, and learner resume state. Added a pg connection pool, same-client transaction helper, parameterized repository methods, explicit migration CLI, and conditional API pool lifecycle.

The schema uses normalized relational columns and foreign keys. It includes preference fields, target/background/reason/timeline/industry/specialization, status, version assignment, and timestamps. Desired depth is never treated as observed capability.

Migration: packages/db/migrations/001_day1_foundation.sql.
Tables: learners, target_profiles, learner_goals, learner_resume_states, plus schema_migrations.
No additional endpoints; GET /health remains the only endpoint.

## Created files

- `PART_2_REPORT.md`
- `packages/db/migrations/001_day1_foundation.sql`
- `packages/db/src/database.ts`
- `packages/db/src/migrations.ts`
- `packages/db/src/models.ts`
- `packages/db/src/repositories.ts`
- `packages/db/test/persistence.test.mjs`
- `services/api/src/migrate.ts`

## Modified files

- `.env.example`
- `README.md`
- `package.json`
- `package-lock.json`
- `packages/db/package.json`
- `packages/db/src/index.ts`
- `services/api/package.json`
- `services/api/tsconfig.json`
- `services/api/src/app.ts`
- `services/api/src/config.ts`
- `services/api/src/server.ts`
- `services/api/test/config.test.ts`

Generated outputs (dist, build info, node_modules) were refreshed. Outside the deliverable, work/run-part2-postgres.mjs and work/postgres-runtime plus temporary work/pg-part2-* clusters were created for verification. The temporary PostgreSQL server was stopped after checks. No existing database or user data was changed.

## Dependencies

Runtime: pg 8.23.0. Development: @types/pg 8.23.1. API now links the local @adaptive-labs/db workspace.
Temporary test runtime only: @embedded-postgres/windows-x64 18.4.0-beta.17 in work/, not an application dependency.
npm installation audit reported zero vulnerabilities.

## Verification

- npm run typecheck: PASS, including build and all four workspaces.
- npm test: PASS, 20 API/configuration tests.
- PostgreSQL integration suite: PASS, 11 scenarios plus its parent test (12 reported tests), zero skips.
- Compiled migration CLI: PASS on a fresh PostgreSQL cluster, then PASS on re-run with no new migrations.
- Concurrent migrations: applied once.
- Learner, profile, goal, and resume round-trips: PASS.
- Duplicate active-goal, invalid enum/timeline, missing foreign key, and cross-learner resume linkage checks: PASS.
- Owner-scoped goal lookup: PASS. This is repository scoping, not completed authentication.
- Transaction rollback and failed migration rollback: PASS.
- Applied-migration checksum validation: PASS.
- Backend lifecycle recreation: PASS.
- Two separate real API server processes started and stopped against the same database: identical goal and TARGET_MAP_REVIEW resume state retrieved through fresh repository connections after restart.
- npm ls --depth=0: dependency links resolved.
- Source review: no real credentials introduced; no frontend or excluded engine features added.

The database suite was invoked by the temporary verification runner using node --test packages/db/test/persistence.test.mjs with a generated DATABASE_URL. The committed npm run test:db command runs that same suite after building. API routes for learner/goal/resume data do not exist yet, so persistence after restart was checked at the repository boundary.

## Assumptions and decisions

- One active primary goal per learner is enforced through a partial unique index on learner_goals where status = active. This avoids a second active-goal pointer that could become inconsistent.
- Target-profile ID and version form an explicit composite reference. Fixtures use test-only profile IDs; the real profile seed remains Part 6.
- Only GOAL_SETUP and TARGET_MAP_REVIEW are persisted at this stage. Internal resume writes enforce structural integrity; transition policy and automatic initialization remain Part 7.
- DATABASE_URL is required for migration/database tests and optional for health-only API startup. A configured API verifies connectivity before serving and releases its pool on close.
- Plain PostgreSQL SQL and pg are suitable for Cloud SQL PostgreSQL. Cloud SQL was not provisioned or remotely verified.
- Docker was unavailable. A temporary native PostgreSQL server ran inside the existing sandbox. The Windows pg_ctl launcher failed to create its restricted token; direct postgres execution worked without changing permissions or sandbox settings.
- Tests use uniquely named schemas and clean up those schemas only. No production database was accessed.
- No Git repository exists here, so no commits were created.

## Unresolved issues / blockers

None for Part 2 acceptance. A permanent development PostgreSQL instance and real DATABASE_URL remain user environment setup; the test server was temporary. See README for migration and test commands.

## Deferred

Part 3 authentication/identity boundary; Part 4 goal orchestration and active-goal switching policy; Part 5 goal API/contracts; Part 6 real target-profile seed; Part 7 resume transition logic/API; Part 8 full Day 1 integration. No frontend, skill graph, practice/evidence, diagnosis/repair, English, RevenueCat, AI/search, or deployment work was started.
