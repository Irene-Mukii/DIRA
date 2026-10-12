-- Add citation_role to activity_test_observations to distinguish context vs outcome citations
ALTER TABLE activity_test_observations
    ADD COLUMN IF NOT EXISTS citation_role TEXT NOT NULL DEFAULT 'context'
        CHECK (citation_role IN ('context', 'outcome'));

-- Update existing rows to have 'context' role
UPDATE activity_test_observations
SET citation_role = 'context'
WHERE citation_role IS NULL;

-- Create index for outcome lookups
CREATE INDEX IF NOT EXISTS idx_activity_test_observations_outcome
    ON activity_test_observations (test_id, learner_id)
    WHERE citation_role = 'outcome';