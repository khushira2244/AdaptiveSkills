# Adaptive Labs backend

Layer 1 backend: email/password identity and resumable learner setup. Requires Node.js 22.14+ and npm. PostgreSQL remains authoritative; the API runs directly on Node.

## Local PostgreSQL

Docker CLI and Compose are installed on the verification machine, but its daemon was unavailable. Compose configuration was validated; container execution and volume recreation were not verified. Tests used the existing native PostgreSQL fallback and a database named adaptive_labs.

When Docker Desktop is running, from this directory:

```sh
npm ci
npm run local:configure
docker compose up -d --wait postgres
npm run db:check
npm run db:migrate
npm start
```

local:configure creates an untracked .env with separate random database/session secrets. It refuses to overwrite an existing .env. It selects port 5432, or 5433 if occupied. If both are occupied, set another POSTGRES_PORT and matching DATABASE_URL manually.

The database is adaptive_labs, bound to 127.0.0.1. Data is stored in the named postgres_data volume. Stop with:

```sh
docker compose stop postgres
```

Remove/recreate the container while retaining data:

```sh
docker compose down
docker compose up -d --wait postgres
npm run db:check
```

Do not add --volumes/-v to down if you want to retain data. Changing .env does not change the password of an already initialized PostgreSQL role.

Alternatively, use a running local PostgreSQL server, create adaptive_labs, and configure DATABASE_URL. The same migration, check, and start commands apply. The temporary native verification runtime remains in the task's work/ directory, outside this deliverable.

## Configuration

See .env.example. Replace placeholders; no real secrets are in source.

- DATABASE_URL: required for database operations and learner APIs. Omit for health-only startup.
- AUTH_SECRET: at least 32 characters; required when starting the learner API. Keep stable across restarts. Rotation invalidates sessions.
- RESUME_STORAGE_DIR: private local CV storage; defaults to .data/resumes.
- HOST, PORT, LOG_LEVEL, NODE_ENV: HTTP/runtime settings.

The API reads environment variables through config.ts. Process variables take precedence over .env.

## Migration and verification

```sh
npm run db:migrate
npm run typecheck
npm test
npm run test:db
```

Migrations run explicitly, never on API startup. Applied migrations have checksums and must not be edited. Pending SQL and migration history commit together under a transaction/advisory lock.

npm test runs API/config tests without PostgreSQL. test:db requires DATABASE_URL pointing to a dedicated test database and CREATE SCHEMA permission. Tests create unique schemas and remove only those schemas. Missing configuration fails rather than silently skipping.

## Contract and scope

See [LAYER_1_API.md](./LAYER_1_API.md) for React Native integration.

Services: LearnerProfileService, SkillProfileService, ResumeIntakeService, GoalService, InterestService, LearningPreferenceService, OnboardingStateService, and identity.

Free-text goals are stored as learner_goal_intents. No target profile or capability map is fabricated. Migration 001 and the original goal/profile repository operations remain unchanged.

Completion returns UNPAID_HOME as client routing data, not billing or entitlement logic. Actual React Native screens and device-level acceptance remain pending.

## Cloud SQL

The production Cloud SQL PostgreSQL plan is unchanged. Run these migrations through a properly authenticated Cloud SQL Auth Proxy or secure PostgreSQL connection, using the environment's DATABASE_URL. Cloud SQL was not provisioned or tested.

CV files currently use private local disk. A deployed multi-instance API will need the planned durable object-storage adapter; no deployment was performed.

## Structure

- packages/contracts: shared Zod request/response schemas.
- packages/db: migrations, transactions, repositories.
- packages/domain: reserved for later learning-domain rules.
- services/api: HTTP boundary, identity, onboarding, CV intake, config and tests.
- scripts: local environment setup.

No frontend, payments, JD analysis, learning-map generation, modules, labs, evidence engine, or repair engine was added.
