ALTER TABLE lab_attempts DROP CONSTRAINT lab_attempts_lab_id_learner_id_status_key;
CREATE UNIQUE INDEX one_lab_attempt_per_status ON lab_attempts(lab_id,learner_id,status);
