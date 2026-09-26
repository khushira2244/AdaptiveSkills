CREATE TABLE revenuecat_customers (
  learner_id uuid PRIMARY KEY REFERENCES learners(learner_id),
  app_user_id text NOT NULL UNIQUE CHECK (btrim(app_user_id) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE learner_trial_states (
  learner_id uuid PRIMARY KEY REFERENCES learners(learner_id),
  product_key text NOT NULL DEFAULT 'TRY_IT_WITH_LABS' CHECK (product_key = 'TRY_IT_WITH_LABS'),
  status text NOT NULL DEFAULT 'NOT_PURCHASED' CHECK (status IN
    ('NOT_PURCHASED','PURCHASE_PENDING','ACTIVE_SETUP_PENDING','ACTIVE','COMPLETED')),
  activated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status IN ('ACTIVE_SETUP_PENDING','ACTIVE','COMPLETED') AND activated_at IS NOT NULL) OR
    (status IN ('NOT_PURCHASED','PURCHASE_PENDING') AND activated_at IS NULL))
);

CREATE TABLE purchase_attempts (
  purchase_attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(learner_id),
  product_key text NOT NULL CHECK (product_key = 'TRY_IT_WITH_LABS'),
  status text NOT NULL CHECK (status IN ('PENDING','CANCELLED','FAILED','SUCCEEDED')),
  platform text CHECK (platform IN ('ios','android')),
  country_code text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_attempts_by_learner ON purchase_attempts(learner_id, created_at DESC);
CREATE UNIQUE INDEX one_pending_purchase_per_learner ON purchase_attempts(learner_id) WHERE status='PENDING';

CREATE TABLE learner_entitlements (
  learner_id uuid NOT NULL REFERENCES learners(learner_id),
  entitlement_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','REVOKED')),
  product_id text,
  store text,
  environment text CHECK (environment IS NULL OR environment IN ('SANDBOX','PRODUCTION')),
  original_transaction_id text,
  latest_transaction_id text,
  purchased_at timestamptz,
  latest_event_id text,
  latest_event_timestamp_ms bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, entitlement_key)
);

CREATE TABLE billing_transactions (
  transaction_id text PRIMARY KEY,
  learner_id uuid NOT NULL REFERENCES learners(learner_id),
  product_key text NOT NULL CHECK (product_key = 'TRY_IT_WITH_LABS'),
  product_id text NOT NULL,
  store text,
  environment text CHECK (environment IS NULL OR environment IN ('SANDBOX','PRODUCTION')),
  amount numeric,
  currency_code text CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  purchased_at timestamptz,
  status text NOT NULL CHECK (status IN ('SUCCEEDED','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_transactions_by_learner ON billing_transactions(learner_id, purchased_at DESC);

CREATE TABLE revenuecat_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  app_user_id text NOT NULL,
  event_timestamp_ms bigint NOT NULL,
  payload jsonb NOT NULL,
  processing_status text NOT NULL CHECK (processing_status IN ('PROCESSED','IGNORED','UNMATCHED')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL DEFAULT now()
);
