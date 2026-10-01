# Layer 3 backend: paid setup to trial-ready learning units

> Historical implementation checkpoint. See the current [learning-engine documentation](../learning-engine.md).

Layer 3 starts only for an authenticated learner with completed onboarding and an active, server-verified RevenueCat entitlement. It keeps the existing Layer 2 commerce state as the purchase source of truth and stores learning setup in its own revisioned workflow.

## State machine

```text
TRIAL_PAID_SETUP_PENDING
  -> TRIAL_SCOPE_PROPOSED
  -> TRIAL_SCOPE_CONFIRMED
  -> TRIAL_GENERATING
  -> TRIAL_READY
                 \-> TRIAL_GENERATION_FAILED -> TRIAL_GENERATING
```

Every transition is validated in the service and appended to `paid_setup_state_events`. Writes use an optimistic `revision`; stale clients receive `STALE_REVISION`. A failed run stores no partial units and may be retried. A ready run is idempotent.

`TRIAL_READY` is reached only after a confirmed scope produces exactly two persisted unit definitions. On success the existing Layer 2 trial state changes from `ACTIVE_SETUP_PENDING` to `ACTIVE`.

## API

All endpoints require the existing bearer session.

- `POST /me/paid-setup/start` checks completed onboarding and the active entitlement, then creates the workflow idempotently.
- `GET /me/paid-setup` returns one frontend-ready aggregate: context, requirements, learning map, selections, units, revision and status.
- `PUT /me/paid-setup/context` saves optional raw JD text, company and product style. Null values are the supported skip-JD path.
- `POST /me/learning-scope/propose` derives reported-known and recommended concepts from persisted learner data.
- `GET /me/learning-map` returns capability tabs and concepts.
- `PUT /me/learning-scope` persists learner selection and deselection. Reported-known concepts are read-only and excluded from teaching.
- `POST /me/learning-scope/confirm` validates dependency closure and requires at least two selected concepts.
- `POST /me/learning-units/generate` creates exactly two ordered unit definitions.
- `GET /me/learning-units` returns the generated definitions.

OpenAI dynamically reasons over the learner's goal, current role, experience, normalized skills, interests, pace, timeline and optional target context. It selects one of the five supported paths: Frontend Engineer, Backend Engineer, Full-Stack Engineer, AI Application Engineer, or Cloud/DevOps Engineer. Focus areas, concepts, explanations, dependencies and depth are generated for the learner rather than selected from a static curriculum.

The Responses API is called with strict JSON schemas. The backend validates every response before persistence. A model failure never creates a scope or unlocks access, and a unit-generation failure preserves the confirmed scope for a safe retry.

## Evidence rules

Manual and CV-confirmed skills are normalized through `normalized_skills` and `normalized_skill_aliases`. This library canonicalizes terms such as `JS`, `React.js`, `Postgres`, `K8s`, and `Node`; it never decides what the learner should study. OpenAI may propose relevant concepts absent from the vocabulary, which are persisted as learner-specific AI-generated concepts.

Matching concepts become `KNOWN_REPORTED`, remain visible, default to unselected, and are not included in generated units. Neither self-report nor CV evidence becomes `KNOWN_PROVEN`; only a future assessment or project may establish proof.

The optional JD is stored separately. Its extracted terms create revisioned target requirements and never modify the learner's skill profile.

## Persistence

Migration `005_layer3_learning_scope.sql` adds:

- `paid_setup_contexts`, `paid_setup_state_events`
- `target_requirements`
- `capabilities`, `concepts`, `concept_dependencies`
- `learner_concept_state`
- `learning_scopes`, `learning_scope_items`
- `learning_units`, `learning_unit_concepts`
- `generation_runs`

It also gives each `learner_goal_intents` row a stable `goal_id`.

Migration `006_dynamic_reasoning.sql` adds the terminology-normalization library, supported target-path state, learner-owned AI-generated capability/concept metadata, and provider/model/response audit fields. Legacy seed concepts from the earlier migration are retained only for migration safety and are not read by the dynamic reasoning path.

Server-only configuration:

```text
OPENAI_API_KEY=<OpenAI project key>
OPENAI_MODEL=gpt-5-mini
```

Never expose the key through React Native or an `EXPO_PUBLIC_*` variable.

## Local verification

```powershell
docker compose up -d postgres
npm run db:migrate
npm run test:db
npm test
```

`packages/db/test/learning.test.mjs` covers unpaid rejection, verified paid entry, supplied and skipped JD, skill reuse without proof, editable recommendations and deep concepts, read-only known concepts, dependency validation, revisions, idempotence, exactly two units, restart persistence, failure without partial units, and successful retry.

Layer 3 intentionally contains no concept reader, lab execution, notes, markers, generated lesson content, or mobile UI.
