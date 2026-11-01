-- NULL marks a legacy question with no confirmed connected-time budget.
-- Bootstrap that question once from its snapshot, never alter saved answers.
ALTER TABLE exam_sessions ADD COLUMN question_remaining_seconds REAL
    CHECK (question_remaining_seconds IS NULL OR question_remaining_seconds >= 0);
ALTER TABLE exam_sessions ADD COLUMN timer_updated_at REAL;
INSERT INTO schema_migrations(version) VALUES (2);
