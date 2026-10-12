-- Allow explicitly queued, development-only demo calls that do not depend on
-- today's school calendar. These rows still require an existing teacher/class.
BEGIN;

ALTER TABLE teacher_follow_up_jobs
    ALTER COLUMN calendar_entry_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS is_manual_demo BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_up_manual_demo_active
    ON teacher_follow_up_jobs (school_id, teacher_id)
    WHERE is_manual_demo = TRUE
      AND status IN ('queued', 'initiating', 'outcome_unknown');

COMMIT;
