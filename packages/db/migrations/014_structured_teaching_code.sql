-- Existing generated lessons remain intact; only future generations use CODE fields.
ALTER TABLE lesson_content_blocks
  ADD COLUMN language text NOT NULL DEFAULT '',
  ADD COLUMN code text NOT NULL DEFAULT '';
ALTER TABLE lesson_content_blocks DROP CONSTRAINT lesson_content_blocks_block_type_check;
ALTER TABLE lesson_content_blocks ADD CONSTRAINT lesson_content_blocks_block_type_check
  CHECK(block_type IN ('EXPLANATION','WHY_IT_MATTERS','TECHNICAL_DETAIL','EXAMPLE','STRUCTURED_VISUAL','CHECKPOINT','TEXT','BULLETS','CODE'));
