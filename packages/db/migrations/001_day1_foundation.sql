CREATE TABLE learners (
  learner_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text,
  preferred_interface_language text,
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE target_profiles (
  target_profile_id text NOT NULL CHECK (btrim(target_profile_id) <> ''),
  version text NOT NULL CHECK (btrim(version) <> ''),
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_profile_id, version)
);

CREATE TABLE learner_goals (
  goal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(learner_id),
  target text NOT NULL CHECK (btrim(target) <> ''),
  current_background text,
  reason text,
  timeline_days integer CHECK (timeline_days > 0),
  industry text,
  specialization text,
  assistance_preference text CHECK (assistance_preference IN ('GUIDE_ME', 'BALANCED', 'MINIMAL_HELP')),
  learner_desired_depth text CHECK (learner_desired_depth IN ('AWARE', 'WORKING', 'PRODUCTION', 'DEEP')),
  status text NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  target_profile_id text NOT NULL,
  target_profile_version text NOT NULL,
  target_profile_assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (target_profile_id, target_profile_version)
    REFERENCES target_profiles(target_profile_id, version),
  UNIQUE (learner_id, goal_id)
);

-- The active relationship is derived from this status, not a second mutable pointer.
CREATE UNIQUE INDEX one_active_goal_per_learner
  ON learner_goals (learner_id) WHERE status = 'active';
CREATE INDEX goals_by_profile ON learner_goals (target_profile_id, target_profile_version);

CREATE TABLE learner_resume_states (
  learner_id uuid PRIMARY KEY REFERENCES learners(learner_id),
  state text NOT NULL CHECK (state IN ('GOAL_SETUP', 'TARGET_MAP_REVIEW')),
  goal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (learner_id, goal_id) REFERENCES learner_goals(learner_id, goal_id),
  CHECK (
    (state = 'GOAL_SETUP' AND goal_id IS NULL) OR
    (state = 'TARGET_MAP_REVIEW' AND goal_id IS NOT NULL)
  )
);

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER learners_updated BEFORE UPDATE ON learners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER target_profiles_updated BEFORE UPDATE ON target_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER learner_goals_updated BEFORE UPDATE ON learner_goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER learner_resume_states_updated BEFORE UPDATE ON learner_resume_states
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
