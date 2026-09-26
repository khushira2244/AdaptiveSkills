CREATE TABLE learner_accounts (
  learner_id uuid PRIMARY KEY REFERENCES learners(learner_id),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE learner_sessions (
  token_hash text PRIMARY KEY,
  learner_id uuid NOT NULL REFERENCES learner_accounts(learner_id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_by_learner ON learner_sessions(learner_id);
CREATE INDEX sessions_by_expiry ON learner_sessions(expires_at);

CREATE TABLE onboarding_states (
  learner_id uuid PRIMARY KEY REFERENCES learners(learner_id),
  current_step text NOT NULL DEFAULT 'profile' CHECK (current_step IN
    ('profile','role','experience','resume','skills','goal','interests','preferences','review','complete')),
  completed boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((completed AND current_step = 'complete' AND completed_at IS NOT NULL) OR
    (NOT completed AND current_step <> 'complete' AND completed_at IS NULL))
);
CREATE TABLE learner_setup_profiles (
  learner_id uuid PRIMARY KEY REFERENCES learners(learner_id),
  role_title text,
  experience_years numeric CHECK (experience_years BETWEEN 0 AND 80)
);
CREATE TABLE learner_skill_assessments (
  skill_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(learner_id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  level text CHECK (level IN ('AWARE','WORKING','PRODUCTION','DEEP')),
  position integer NOT NULL CHECK (position >= 0),
  UNIQUE (learner_id, skill_id)
);
CREATE UNIQUE INDEX unique_learner_skill_name ON learner_skill_assessments(learner_id, lower(name));
CREATE TABLE learner_subskill_assessments (
  skill_id uuid NOT NULL REFERENCES learner_skill_assessments(skill_id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  level text CHECK (level IN ('AWARE','WORKING','PRODUCTION','DEEP')),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (skill_id, name)
);
CREATE TABLE learner_goal_intents (
  learner_id uuid PRIMARY KEY REFERENCES learners(learner_id),
  target text NOT NULL CHECK (btrim(target) <> ''),
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE learner_goal_intents IS 'Learner-confirmed free-text intent. Target profile mapping is a later layer.';
CREATE TABLE learner_interests (
  learner_id uuid NOT NULL REFERENCES learners(learner_id),
  interest text NOT NULL,
  position integer NOT NULL,
  PRIMARY KEY (learner_id, interest)
);
CREATE TABLE learner_learning_preferences (
  learner_id uuid PRIMARY KEY REFERENCES learners(learner_id),
  timeline_days integer CHECK (timeline_days BETWEEN 1 AND 3650),
  pace text CHECK (pace IN ('CASUAL','STEADY','INTENSIVE'))
);
CREATE TABLE learner_resume_documents (
  resume_id uuid PRIMARY KEY,
  learner_id uuid NOT NULL UNIQUE REFERENCES learners(learner_id),
  filename text NOT NULL,
  mime_type text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  suggestions jsonb NOT NULL CHECK (jsonb_typeof(suggestions) = 'array'),
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
