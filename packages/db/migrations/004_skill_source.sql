ALTER TABLE learner_skill_assessments
  ADD COLUMN source text NOT NULL DEFAULT 'MANUAL'
  CHECK (source IN ('MANUAL', 'CV_CONFIRMED'));

COMMENT ON COLUMN learner_skill_assessments.source IS
  'How the learner added this skill. Depth always remains learner-confirmed.';
