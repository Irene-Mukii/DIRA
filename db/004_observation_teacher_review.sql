-- Keep teacher review separate from evidence verification and preserve edit history.
ALTER TABLE observations
    ADD COLUMN IF NOT EXISTS teacher_review_status TEXT NOT NULL DEFAULT 'not_required'
        CHECK (teacher_review_status IN ('not_required', 'recorded', 'confirmed', 'updated')),
    ADD COLUMN IF NOT EXISTS reviewed_observation TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_by_teacher_id TEXT REFERENCES teachers(teacher_id),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

UPDATE observations
SET teacher_review_status = 'recorded'
WHERE capture_method IN ('in_app_voice', 'basic_phone_callback')
  AND teacher_review_status = 'not_required';

CREATE INDEX IF NOT EXISTS idx_observations_teacher_review
    ON observations (teacher_id, teacher_review_status, created_at DESC)
    WHERE teacher_review_status = 'recorded';

CREATE TABLE IF NOT EXISTS observation_review_history (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id TEXT NOT NULL UNIQUE,
    observation_id TEXT NOT NULL REFERENCES observations(observation_id) ON DELETE CASCADE,
    reviewer_id TEXT NOT NULL REFERENCES teachers(teacher_id),
    review_status TEXT NOT NULL CHECK (review_status IN ('confirmed', 'updated')),
    previous_text TEXT NOT NULL,
    updated_text TEXT,
    previous_observation_type TEXT,
    updated_observation_type TEXT,
    previous_linked_test_id TEXT,
    updated_linked_test_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (review_status = 'confirmed' AND updated_text IS NULL)
        OR (review_status = 'updated' AND updated_text IS NOT NULL)
    )
);
