ALTER TABLE capabilities ADD COLUMN archived_at timestamptz;
ALTER TABLE concepts ADD COLUMN archived_at timestamptz;

UPDATE capabilities SET archived_at=now() WHERE origin='LEGACY_SEED' AND archived_at IS NULL;
UPDATE concepts SET archived_at=now() WHERE origin='LEGACY_SEED' AND archived_at IS NULL;

CREATE INDEX active_ai_capabilities_by_learner ON capabilities(learner_id,position)
  WHERE origin='AI_GENERATED' AND archived_at IS NULL;

COMMENT ON COLUMN capabilities.archived_at IS 'Legacy seeded curriculum is archived; personalized runtime reads only learner-owned AI_GENERATED rows.';
COMMENT ON COLUMN concepts.archived_at IS 'Legacy seeded curriculum is archived; normalized terminology remains in normalized_skills and is not curriculum.';
