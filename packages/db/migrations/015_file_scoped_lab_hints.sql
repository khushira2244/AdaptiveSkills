ALTER TABLE lab_hint_events
  ADD COLUMN lab_file_id uuid REFERENCES lab_files(lab_file_id) ON DELETE CASCADE;

CREATE INDEX lab_hints_by_file
  ON lab_hint_events(attempt_id, lab_file_id, hint_number);

COMMENT ON COLUMN lab_hint_events.lab_file_id IS
  'The learner-owned lab file whose saved draft was used to generate this hint.';
