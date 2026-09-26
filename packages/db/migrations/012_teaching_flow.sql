ALTER TABLE paid_setup_contexts
  ADD COLUMN target_depth text NOT NULL DEFAULT 'STANDARD'
  CHECK (target_depth IN ('BASIC','STANDARD','DEEP'));

CREATE TABLE unit_teaching_generations (
  generation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(learner_id),
  unit_id uuid NOT NULL UNIQUE REFERENCES learning_units(unit_id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('RUNNING','SUCCEEDED','FAILED')),
  introduction text,
  provider text, model text, response_id text, error_code text,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);

CREATE TABLE concept_lessons (
  lesson_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES learning_units(unit_id) ON DELETE CASCADE,
  concept_id text NOT NULL REFERENCES concepts(concept_id),
  position integer NOT NULL,
  title text NOT NULL, objective text NOT NULL, recap jsonb NOT NULL,
  UNIQUE(unit_id,concept_id), UNIQUE(unit_id,position)
);

CREATE TABLE lesson_content_blocks (
  block_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES concept_lessons(lesson_id) ON DELETE CASCADE,
  position integer NOT NULL,
  block_type text NOT NULL CHECK(block_type IN ('EXPLANATION','WHY_IT_MATTERS','TECHNICAL_DETAIL','EXAMPLE','STRUCTURED_VISUAL','CHECKPOINT')),
  title text NOT NULL, body text NOT NULL, items jsonb NOT NULL DEFAULT '[]',
  UNIQUE(lesson_id,position)
);

CREATE TABLE learner_lesson_progress (
  learner_id uuid NOT NULL REFERENCES learners(learner_id),
  lesson_id uuid NOT NULL REFERENCES concept_lessons(lesson_id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  last_block_position integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  PRIMARY KEY(learner_id,lesson_id)
);

COMMENT ON TABLE unit_teaching_generations IS 'One persisted teaching generation per unit. Opening a unit again reads saved content and never spends another generation.';
COMMENT ON TABLE concept_lessons IS 'Actual generated teaching material for concepts assigned to the current runway.';
