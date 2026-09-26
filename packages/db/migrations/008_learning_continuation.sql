CREATE TABLE commercial_offers (
  commercial_product_key text PRIMARY KEY CHECK(commercial_product_key IN ('TRY_IT','FOCUS','GROWTH','DEEP')),
  revenuecat_package_id text, revenuecat_product_id text, active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO commercial_offers(commercial_product_key,active) VALUES ('TRY_IT',true),('FOCUS',false),('GROWTH',false),('DEEP',false);

CREATE TABLE learning_runways (
  runway_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL REFERENCES learners(learner_id),
  goal_id uuid NOT NULL REFERENCES learner_goal_intents(goal_id), scope_id uuid REFERENCES learning_scopes(scope_id),
  commercial_product_key text NOT NULL REFERENCES commercial_offers(commercial_product_key),
  planned_units integer NOT NULL CHECK(planned_units>0), planned_labs integer NOT NULL CHECK(planned_labs>=0),
  status text NOT NULL CHECK(status IN ('ACTIVE','CURRENT_RUNWAY_COMPLETE','NEXT_RUNWAY_PROPOSED','NEXT_RUNWAY_AWAITING_PURCHASE','NEXT_RUNWAY_PURCHASED','NEXT_RUNWAY_READY','NEXT_RUNWAY_GENERATION_FAILED')),
  discovered_future_scope jsonb NOT NULL DEFAULT '[]', purchased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_open_runway_per_learner ON learning_runways(learner_id) WHERE status IN ('ACTIVE','NEXT_RUNWAY_PROPOSED','NEXT_RUNWAY_AWAITING_PURCHASE','NEXT_RUNWAY_PURCHASED','NEXT_RUNWAY_READY','NEXT_RUNWAY_GENERATION_FAILED');
CREATE INDEX runways_by_learner ON learning_runways(learner_id,created_at DESC);

CREATE TABLE learning_runway_units (
  runway_id uuid NOT NULL REFERENCES learning_runways(runway_id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES learning_units(unit_id), position integer NOT NULL,
  status text NOT NULL DEFAULT 'LOCKED' CHECK(status IN ('LOCKED','READY','IN_PROGRESS','DOUBT_CHECKPOINT','COMPLETE')),
  PRIMARY KEY(runway_id,unit_id),UNIQUE(runway_id,position)
);

CREATE TABLE labs (
  lab_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL REFERENCES learners(learner_id),
  runway_id uuid NOT NULL REFERENCES learning_runways(runway_id), unit_id uuid NOT NULL REFERENCES learning_units(unit_id),
  title text NOT NULL, required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'LOCKED' CHECK(status IN ('LOCKED','READY','IN_PROGRESS','COMPLETE')),
  generation_context jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(runway_id,unit_id)
);
CREATE TABLE lab_files (lab_file_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lab_id uuid NOT NULL REFERENCES labs(lab_id) ON DELETE CASCADE,path text NOT NULL,kind text NOT NULL,content text,UNIQUE(lab_id,path));
CREATE TABLE lab_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lab_id uuid NOT NULL REFERENCES labs(lab_id),learner_id uuid NOT NULL REFERENCES learners(learner_id),
  status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('IN_PROGRESS','SUBMITTED','COMPLETE')),
  hints_used integer NOT NULL DEFAULT 0 CHECK(hints_used BETWEEN 0 AND 2),
  highest_assistance_level text NOT NULL DEFAULT 'INDEPENDENT' CHECK(highest_assistance_level IN ('INDEPENDENT','HINT_1','HINT_2','SYSTEM_FILLED','NOT_DEMONSTRATED')),
  system_fill_used boolean NOT NULL DEFAULT false,started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
  UNIQUE(lab_id,learner_id,status) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE TABLE lab_hint_events (
  hint_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),attempt_id uuid NOT NULL REFERENCES lab_attempts(attempt_id) ON DELETE CASCADE,
  hint_number smallint NOT NULL CHECK(hint_number IN (1,2)),hint_text text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(attempt_id,hint_number)
);
CREATE TABLE lab_evidence (
  evidence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),attempt_id uuid NOT NULL REFERENCES lab_attempts(attempt_id),concept_id text REFERENCES concepts(concept_id),
  assistance_level text NOT NULL CHECK(assistance_level IN ('INDEPENDENT','HINT_1','HINT_2','SYSTEM_FILLED','NOT_DEMONSTRATED')),
  outcome text NOT NULL CHECK(outcome IN ('DEMONSTRATED','PARTIAL','NOT_DEMONSTRATED')),details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(NOT(assistance_level='SYSTEM_FILLED' AND outcome='DEMONSTRATED'))
);

CREATE TABLE learning_markers (
  marker_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),learner_id uuid NOT NULL REFERENCES learners(learner_id),
  unit_id uuid REFERENCES learning_units(unit_id),concept_id text REFERENCES concepts(concept_id),lab_id uuid REFERENCES labs(lab_id),
  marker_type text NOT NULL CHECK(marker_type IN ('I_KNOW_THIS','DONT_UNDERSTAND','GO_DEEPER','NOTE')),
  source_text text,created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz
);
CREATE INDEX markers_by_learner ON learning_markers(learner_id,created_at DESC);
CREATE TABLE learning_notes (
  note_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),learner_id uuid NOT NULL REFERENCES learners(learner_id),
  unit_id uuid REFERENCES learning_units(unit_id),concept_id text REFERENCES concepts(concept_id),lab_id uuid REFERENCES labs(lab_id),
  attachment_type text NOT NULL CHECK(attachment_type IN ('UNIT','CONCEPT','SELECTED_TEXT','LAB','FILE','CODE_SELECTION','LAB_STEP')),
  attachment_ref text,body text NOT NULL CHECK(btrim(body)<>''),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_by_learner ON learning_notes(learner_id,created_at DESC);

CREATE TABLE learner_doubts (
  doubt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),learner_id uuid NOT NULL REFERENCES learners(learner_id),
  marker_id uuid REFERENCES learning_markers(marker_id),source_unit_id uuid REFERENCES learning_units(unit_id),source_concept_id text REFERENCES concepts(concept_id),
  source_text text NOT NULL,marker_type text NOT NULL DEFAULT 'DONT_UNDERSTAND' CHECK(marker_type IN ('DONT_UNDERSTAND','GO_DEEPER')),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','PLANNED','RESOLVED','DEFERRED')),
  resolution_type text CHECK(resolution_type IN ('EXPLAIN_AT_CHECKPOINT','RESOLVE_BEFORE_LAB','MERGE_INTO_LAB','MERGE_INTO_NEXT_UNIT','GENERATE_REPAIR','RESOLVED_BY_EVIDENCE')),
  target_unit_id uuid REFERENCES learning_units(unit_id),target_lab_id uuid REFERENCES labs(lab_id),must_resolve_before_activity_id uuid,
  resolved_at timestamptz,resolution_evidence_id uuid REFERENCES lab_evidence(evidence_id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX open_doubts_by_learner ON learner_doubts(learner_id,status) WHERE status IN ('OPEN','PLANNED','DEFERRED');
CREATE TABLE doubt_resolution_plans (plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),doubt_id uuid NOT NULL UNIQUE REFERENCES learner_doubts(doubt_id) ON DELETE CASCADE,resolution_type text NOT NULL,reason text NOT NULL,context jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE unit_completion_evidence (
  unit_evidence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),learner_id uuid NOT NULL REFERENCES learners(learner_id),unit_id uuid NOT NULL REFERENCES learning_units(unit_id),
  checkpoint_status text NOT NULL CHECK(checkpoint_status IN ('CLEAR','DOUBTS_PLANNED','BLOCKED')),summary jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(learner_id,unit_id)
);
CREATE TABLE continuation_analyses (
  analysis_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),learner_id uuid NOT NULL REFERENCES learners(learner_id),source_runway_id uuid NOT NULL REFERENCES learning_runways(runway_id),
  status text NOT NULL CHECK(status IN ('RUNNING','SUCCEEDED','FAILED')),remaining_requirements jsonb NOT NULL DEFAULT '[]',remaining_capability_gaps jsonb NOT NULL DEFAULT '[]',
  prerequisite_dependencies jsonb NOT NULL DEFAULT '[]',no_teaching_needed jsonb NOT NULL DEFAULT '[]',repair_concepts jsonb NOT NULL DEFAULT '[]',merge_into_future_labs jsonb NOT NULL DEFAULT '[]',
  proposed_runway jsonb,planned_units integer,planned_labs integer,commercial_product_key text REFERENCES commercial_offers(commercial_product_key),
  provider text,model text,response_id text,error_code text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
  UNIQUE(source_runway_id)
);

COMMENT ON TABLE commercial_offers IS 'Commercial keys and optional RevenueCat mappings only; prices never live in learning logic.';
COMMENT ON COLUMN learning_runways.discovered_future_scope IS 'New gaps that do not fit the purchased runway and are queued for the next continuation analysis.';
