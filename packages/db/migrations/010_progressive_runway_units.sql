ALTER TABLE learning_units DROP CONSTRAINT learning_units_sequence_check;
ALTER TABLE learning_units ADD CONSTRAINT learning_units_sequence_positive CHECK(sequence>0);
ALTER TABLE learning_runways ADD COLUMN source_analysis_id uuid REFERENCES continuation_analyses(analysis_id);
