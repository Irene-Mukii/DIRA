-- Align activity-test persistence with the evidence-summary lifecycle.
-- Existing legacy Pending/In progress tests are treated as teacher-approved ACCEPTED
-- tests per the approved development-data migration decision.

BEGIN;

ALTER TABLE activity_tests
    ADD COLUMN IF NOT EXISTS exploration_question TEXT,
    ADD COLUMN IF NOT EXISTS hypothesis TEXT,
    ADD COLUMN IF NOT EXISTS reason TEXT,
    ADD COLUMN IF NOT EXISTS purpose TEXT,
    ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS what_to_observe TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS what_to_log_after TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS limitations TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS retrieval_status TEXT NOT NULL DEFAULT 'not_attempted',
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS supersedes_test_id TEXT,
    ADD COLUMN IF NOT EXISTS approval_submission_id TEXT,
    ADD COLUMN IF NOT EXISTS suggestion_payload JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE activity_tests
    DROP CONSTRAINT IF EXISTS activity_tests_status_check;
ALTER TABLE activity_tests
    DROP CONSTRAINT IF EXISTS activity_tests_estimated_minutes_check,
    DROP CONSTRAINT IF EXISTS activity_tests_retrieval_status_check,
    DROP CONSTRAINT IF EXISTS activity_tests_supersedes_same_learner_fk,
    DROP CONSTRAINT IF EXISTS activity_tests_completed_outcome_check,
    DROP CONSTRAINT IF EXISTS activity_tests_accepted_at_check;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM activity_tests
        WHERE UPPER(status) NOT IN (
            'COMPLETED', 'SUGGESTED', 'ACCEPTED', 'PENDING', 'IN PROGRESS'
        )
    ) THEN
        RAISE EXCEPTION 'Activity-test migration found an unmappable legacy status';
    END IF;
END $$;

UPDATE activity_tests
SET status = CASE UPPER(status)
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'SUGGESTED' THEN 'SUGGESTED'
    WHEN 'ACCEPTED' THEN 'ACCEPTED'
    WHEN 'PENDING' THEN 'ACCEPTED'
    WHEN 'IN PROGRESS' THEN 'ACCEPTED'
END;

UPDATE activity_tests t
SET accepted_at = COALESCE(t.accepted_at, t.activity_date::timestamp),
    completed_at = COALESCE(t.completed_at, o.observed_at, t.activity_date::timestamp)
FROM observations o
WHERE t.status = 'COMPLETED'
  AND o.observation_id = t.outcome_observation_id;

UPDATE activity_tests
SET accepted_at = COALESCE(accepted_at, activity_date::timestamp)
WHERE status = 'ACCEPTED';

ALTER TABLE activity_tests
    ALTER COLUMN status SET NOT NULL,
    ADD CONSTRAINT activity_tests_status_check
        CHECK (status IN ('SUGGESTED', 'ACCEPTED', 'COMPLETED')),
    ADD CONSTRAINT activity_tests_estimated_minutes_check
        CHECK (estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 180),
    ADD CONSTRAINT activity_tests_retrieval_status_check
        CHECK (retrieval_status IN ('not_attempted', 'success', 'partial', 'no_relevant_results', 'failed')),
    ADD CONSTRAINT activity_tests_supersedes_same_learner_fk
        FOREIGN KEY (supersedes_test_id, learner_id)
        REFERENCES activity_tests(test_id, learner_id),
    ADD CONSTRAINT activity_tests_completed_outcome_check
        CHECK (
            (status = 'COMPLETED' AND outcome_observation_id IS NOT NULL AND completed_at IS NOT NULL)
            OR (status <> 'COMPLETED' AND outcome_observation_id IS NULL AND completed_at IS NULL)
        ),
    ADD CONSTRAINT activity_tests_accepted_at_check
        CHECK (status <> 'ACCEPTED' OR accepted_at IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS activity_tests_approval_submission_id_idx
    ON activity_tests (approval_submission_id)
    WHERE approval_submission_id IS NOT NULL;

ALTER TABLE activity_test_observations
    ADD COLUMN IF NOT EXISTS citation_role TEXT NOT NULL DEFAULT 'context'
        CHECK (citation_role IN ('supporting', 'contradicting', 'context'));

CREATE INDEX IF NOT EXISTS idx_activity_tests_learner_status
    ON activity_tests (learner_id, status, activity_date DESC);

COMMIT;
