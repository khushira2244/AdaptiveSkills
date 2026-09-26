ALTER TABLE learner_goal_intents ADD COLUMN goal_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE learner_goal_intents ADD CONSTRAINT learner_goal_intents_goal_id_key UNIQUE(goal_id);

CREATE TABLE paid_setup_contexts (
  learner_id uuid PRIMARY KEY REFERENCES learners(learner_id),
  goal_id uuid NOT NULL REFERENCES learner_goal_intents(goal_id),
  jd_text text,
  target_company text,
  product_style text,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  status text NOT NULL DEFAULT 'TRIAL_PAID_SETUP_PENDING' CHECK (status IN
    ('TRIAL_PAID_SETUP_PENDING','TRIAL_SCOPE_PROPOSED','TRIAL_SCOPE_CONFIRMED','TRIAL_GENERATING','TRIAL_READY','TRIAL_GENERATION_FAILED')),
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE paid_setup_state_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL REFERENCES learners(learner_id),
  revision integer NOT NULL, from_status text, to_status text NOT NULL, reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX paid_setup_events_by_learner ON paid_setup_state_events(learner_id,created_at);

CREATE TABLE target_requirements (
  requirement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL REFERENCES learners(learner_id),
  revision integer NOT NULL, name text NOT NULL, classification text NOT NULL CHECK(classification IN ('REQUIRED','USEFUL','OPTIONAL')),
  reason text NOT NULL, source text NOT NULL CHECK(source IN ('GOAL','PROFILE','JD','INTEREST')), position integer NOT NULL,
  UNIQUE(learner_id,revision,name)
);
CREATE TABLE capabilities (
  capability_id text PRIMARY KEY, domain text NOT NULL, tab text NOT NULL CHECK(tab IN ('CORE_BACKEND','RELIABILITY_AND_SCALE','PRODUCTION_AND_SYSTEMS')),
  name text NOT NULL, reason text NOT NULL, scenario text NOT NULL, position integer NOT NULL
);
CREATE TABLE concepts (
  concept_id text PRIMARY KEY, capability_id text NOT NULL REFERENCES capabilities(capability_id), name text NOT NULL,
  short_example text NOT NULL, requirement_class text NOT NULL CHECK(requirement_class IN ('REQUIRED','USEFUL','OPTIONAL')),
  depth_category text NOT NULL CHECK(depth_category IN ('FOUNDATION','APPLIED','DEEP')),
  aliases text[] NOT NULL DEFAULT '{}', position integer NOT NULL
);
CREATE TABLE concept_dependencies (
  concept_id text NOT NULL REFERENCES concepts(concept_id), prerequisite_concept_id text NOT NULL REFERENCES concepts(concept_id),
  PRIMARY KEY(concept_id,prerequisite_concept_id), CHECK(concept_id<>prerequisite_concept_id)
);
CREATE TABLE learner_concept_state (
  learner_id uuid NOT NULL REFERENCES learners(learner_id), concept_id text NOT NULL REFERENCES concepts(concept_id), revision integer NOT NULL,
  relationship text NOT NULL CHECK(relationship IN ('KNOWN_REPORTED','KNOWN_PROVEN','RECOMMENDED_NEXT','DEEPER_OPTIONAL','NOT_RELEVANT')),
  evidence_source text CHECK(evidence_source IN ('SELF_REPORT','CV_CONFIRMED','ASSESSMENT','PROJECT')), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(learner_id,concept_id)
);
CREATE TABLE learning_scopes (
  scope_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL REFERENCES learners(learner_id), revision integer NOT NULL,
  status text NOT NULL CHECK(status IN ('PROPOSED','CONFIRMED')), created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz,
  UNIQUE(learner_id,revision)
);
CREATE TABLE learning_scope_items (
  scope_id uuid NOT NULL REFERENCES learning_scopes(scope_id) ON DELETE CASCADE, concept_id text NOT NULL REFERENCES concepts(concept_id),
  selected boolean NOT NULL, selection_source text NOT NULL CHECK(selection_source IN ('RECOMMENDATION','LEARNER','DEPENDENCY','KNOWN')),
  position integer NOT NULL, PRIMARY KEY(scope_id,concept_id)
);
CREATE TABLE learning_units (
  unit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL REFERENCES learners(learner_id),
  scope_id uuid NOT NULL REFERENCES learning_scopes(scope_id), sequence smallint NOT NULL CHECK(sequence IN (1,2)), title text NOT NULL,
  goal text NOT NULL, prerequisites jsonb NOT NULL, product_context text NOT NULL, grouping_reason text NOT NULL,
  lab_outcome_placeholder text NOT NULL, status text NOT NULL DEFAULT 'READY' CHECK(status='READY'), UNIQUE(scope_id,sequence)
);
CREATE TABLE learning_unit_concepts (
  unit_id uuid NOT NULL REFERENCES learning_units(unit_id) ON DELETE CASCADE, concept_id text NOT NULL REFERENCES concepts(concept_id),
  position integer NOT NULL, PRIMARY KEY(unit_id,concept_id)
);
CREATE TABLE generation_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL REFERENCES learners(learner_id), scope_id uuid NOT NULL REFERENCES learning_scopes(scope_id),
  revision integer NOT NULL, status text NOT NULL CHECK(status IN ('RUNNING','SUCCEEDED','FAILED')), error_code text,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, UNIQUE(scope_id)
);

INSERT INTO capabilities VALUES
('api-design','BACKEND','CORE_BACKEND','API design','Defines clear service boundaries and contracts.','Design an API consumed by a mobile product.',1),
('data-modeling','BACKEND','CORE_BACKEND','Data modeling','Keeps product state consistent and queryable.','Model learner and commerce data safely.',2),
('auth-security','BACKEND','CORE_BACKEND','Authentication and security','Protects identity and private data.','Secure authenticated API operations.',3),
('integrations','BACKEND','CORE_BACKEND','Integrations and async work','Coordinates APIs, events and background work.','Process an external event safely.',4),
('reliability','BACKEND','RELIABILITY_AND_SCALE','Reliability and failure handling','Makes failures explicit and recoverable.','Handle retries without duplicate work.',5),
('scale-performance','BACKEND','RELIABILITY_AND_SCALE','Scale and performance','Keeps response times stable as usage grows.','Optimize a frequently used endpoint.',6),
('testing','BACKEND','RELIABILITY_AND_SCALE','Testing strategy','Proves behavior and ownership boundaries.','Verify a stateful API across retries.',7),
('architecture','BACKEND','PRODUCTION_AND_SYSTEMS','System architecture','Makes service and data boundaries explicit.','Evolve a backend without coupling product layers.',8),
('production','BACKEND','PRODUCTION_AND_SYSTEMS','Production systems','Connects code to observable operations.','Operate a service safely in production.',9);
INSERT INTO concepts VALUES
('http-contracts','api-design','HTTP contracts','Validate a versioned JSON request.','REQUIRED','FOUNDATION',ARRAY['api','rest','http'],1),
('request-validation','api-design','Request validation','Reject malformed input with a stable error.','REQUIRED','APPLIED',ARRAY['validation','zod'],2),
('relational-modeling','data-modeling','Relational modeling','Represent ownership with keys and constraints.','REQUIRED','FOUNDATION',ARRAY['sql','postgresql','database'],1),
('transactions','data-modeling','Transactions','Commit a multi-table state change atomically.','REQUIRED','APPLIED',ARRAY['transaction','postgres'],2),
('authentication','auth-security','Authentication','Resolve a bearer token to one learner.','REQUIRED','FOUNDATION',ARRAY['authentication','auth'],1),
('authorization','auth-security','Authorization','Prevent one learner reading another learner.','REQUIRED','APPLIED',ARRAY['authorization','security'],2),
('event-processing','integrations','Event processing','Apply an external event once and in order.','USEFUL','APPLIED',ARRAY['events','webhook','async'],1),
('background-work','integrations','Background work','Move slow work behind a durable run record.','OPTIONAL','DEEP',ARRAY['queue','worker','jobs'],2),
('idempotency','reliability','Idempotency','Retry generation without duplicate units.','REQUIRED','APPLIED',ARRAY['idempotency','retry'],1),
('failure-recovery','reliability','Failure recovery','Persist a failed run that can be retried.','USEFUL','APPLIED',ARRAY['errors','reliability'],2),
('indexes','scale-performance','Indexes and query plans','Use an index for a learner-scoped lookup.','USEFUL','APPLIED',ARRAY['indexing','performance'],1),
('caching','scale-performance','Caching strategy','Choose safe cache boundaries for personalized data.','OPTIONAL','DEEP',ARRAY['cache','redis'],2),
('integration-testing','testing','Integration testing','Exercise API and PostgreSQL behavior together.','REQUIRED','APPLIED',ARRAY['testing','test'],1),
('contract-testing','testing','Contract testing','Validate responses against shared schemas.','USEFUL','APPLIED',ARRAY['contract','schema'],2),
('service-boundaries','architecture','Service boundaries','Keep learning, commerce and identity responsibilities separate.','USEFUL','APPLIED',ARRAY['architecture','services'],1),
('state-machines','architecture','State machines','Restrict workflow changes to explicit transitions.','USEFUL','DEEP',ARRAY['workflow','state'],2),
('observability','production','Observability','Correlate logs without exposing private content.','USEFUL','APPLIED',ARRAY['logging','monitoring'],1),
('deployment','production','Deployment and configuration','Separate runtime configuration from code.','OPTIONAL','DEEP',ARRAY['docker','cloud','deployment'],2);
INSERT INTO concept_dependencies VALUES
('request-validation','http-contracts'),('transactions','relational-modeling'),('authorization','authentication'),
('background-work','event-processing'),('failure-recovery','idempotency'),('caching','indexes'),
('contract-testing','integration-testing'),('state-machines','service-boundaries'),('deployment','observability');
