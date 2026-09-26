ALTER TABLE learning_markers
  ADD COLUMN source_type text NOT NULL DEFAULT 'CONCEPT_SECTION',
  ADD COLUMN source_id text,
  ADD COLUMN selected_text text;
ALTER TABLE learning_markers DROP CONSTRAINT learning_markers_marker_type_check;
ALTER TABLE learning_markers ADD CONSTRAINT learning_markers_marker_type_check
  CHECK(marker_type IN ('I_KNOW_THIS','DONT_UNDERSTAND','GO_DEEPER'));

ALTER TABLE learning_notes
  ADD COLUMN source_type text NOT NULL DEFAULT 'UNIT',
  ADD COLUMN source_id text,
  ADD COLUMN source_file_id uuid,
  ADD COLUMN selected_text text;

CREATE TABLE marked_words (
  marked_word_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(learner_id),
  source_type text NOT NULL,
  source_id text,
  source_unit_id uuid REFERENCES learning_units(unit_id),
  source_concept_id text REFERENCES concepts(concept_id),
  source_lab_id uuid REFERENCES labs(lab_id),
  selected_text text NOT NULL CHECK(btrim(selected_text)<>''),
  simple_meaning text NOT NULL CHECK(btrim(simple_meaning)<>''),
  technical_meaning text NOT NULL CHECK(btrim(technical_meaning)<>''),
  source_context text,
  learner_status text NOT NULL CHECK(learner_status IN ('I_KNOW_THIS','DONT_UNDERSTAND','GO_DEEPER')),
  created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE INDEX marked_words_by_learner ON marked_words(learner_id,created_at DESC);

ALTER TABLE lab_files
  ADD COLUMN role text NOT NULL DEFAULT 'PROVIDED' CHECK(role IN ('PROVIDED','READ_ONLY','YOU_BUILD','OPTIONAL_REFERENCE','TEST')),
  ADD COLUMN human_meaning text,
  ADD COLUMN technical_role text,
  ADD COLUMN input_output text,
  ADD COLUMN learning_purpose text;

CREATE TABLE lab_attempt_file_state (
  file_state_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES lab_attempts(attempt_id) ON DELETE CASCADE,
  lab_file_id uuid NOT NULL REFERENCES lab_files(lab_file_id),
  learner_id uuid NOT NULL REFERENCES learners(learner_id),
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attempt_id,lab_file_id)
);

CREATE TABLE lab_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id uuid NOT NULL REFERENCES lab_attempts(attempt_id),
  learner_id uuid NOT NULL REFERENCES learners(learner_id), status text NOT NULL CHECK(status IN ('PASSED','FAILED','ERROR')),
  result jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE lab_submissions (
  submission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id uuid NOT NULL REFERENCES lab_attempts(attempt_id),
  learner_id uuid NOT NULL REFERENCES learners(learner_id), snapshot jsonb NOT NULL,
  evaluation jsonb NOT NULL DEFAULT '{}', completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lab_attempts ADD COLUMN system_assistance_used boolean NOT NULL DEFAULT false;
ALTER TABLE lab_attempts DROP CONSTRAINT lab_attempts_highest_assistance_level_check;
ALTER TABLE lab_attempts ADD CONSTRAINT lab_attempts_highest_assistance_level_check
  CHECK(highest_assistance_level IN ('INDEPENDENT','HINT_1','HINT_2','SYSTEM_ASSISTED','NOT_DEMONSTRATED'));
UPDATE lab_evidence SET assistance_level='SYSTEM_ASSISTED' WHERE assistance_level='SYSTEM_FILLED';
ALTER TABLE lab_evidence DROP CONSTRAINT lab_evidence_assistance_level_check;
ALTER TABLE lab_evidence DROP CONSTRAINT lab_evidence_check;
ALTER TABLE lab_evidence ADD CONSTRAINT lab_evidence_assistance_level_check
  CHECK(assistance_level IN ('INDEPENDENT','HINT_1','HINT_2','SYSTEM_ASSISTED','NOT_DEMONSTRATED'));
ALTER TABLE lab_evidence ADD CONSTRAINT lab_evidence_system_assistance_not_independent
  CHECK(NOT(assistance_level='SYSTEM_ASSISTED' AND outcome='DEMONSTRATED'));

COMMENT ON TABLE marked_words IS 'Learner glossary generated from contextual selections; meanings are dynamic, never seeded curriculum.';
